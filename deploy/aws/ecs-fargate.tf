# STARTER TEMPLATE - review before use. Single-tenant ECS Fargate deployment
# behind an HTTPS ALB. Not validated against a live AWS account.
#
#   terraform init && terraform apply -var-file=city.tfvars
# Then point the city's CNAME at the `alb_dns_name` output.

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}

# ── Variables ────────────────────────────────────────────────────────

variable "region" {
  type    = string
  default = "us-east-2"
}

variable "image_uri" {
  type        = string
  description = "Container image, e.g. 123456789012.dkr.ecr.us-east-2.amazonaws.com/service-guide:1.0.0 (pin a tag or digest)."
}

variable "city_slug" {
  type        = string
  description = "Short lowercase name used to prefix resources, e.g. austin."
}

variable "vpc_id" {
  type = string
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "Subnets for the tasks. Need egress to the internet (NAT) or VPC endpoints for ECR, Logs, Secrets Manager, and api.openai.com."
}

variable "public_subnet_ids" {
  type        = list(string)
  description = "At least two public subnets in different AZs for the ALB."
}

variable "certificate_arn" {
  type        = string
  description = "ACM certificate ARN covering the city hostname (same region as the ALB)."
}

variable "openai_api_key_secret_arn" {
  type        = string
  description = "Secrets Manager secret ARN whose value is the OpenAI API key (plain string)."
}

variable "admin_api_token_secret_arn" {
  type        = string
  default     = ""
  description = "Optional Secrets Manager ARN for ADMIN_API_TOKEN. Empty keeps admin catalog writes disabled."
}

variable "public_origin" {
  type        = string
  description = "Public https origin used for service links in SMS/email shares, e.g. https://services.example.gov."
}

variable "demo_mode" {
  type    = bool
  default = false
}

variable "desired_count" {
  type    = number
  default = 2
}

variable "cpu" {
  type    = number
  default = 512
}

variable "memory" {
  type    = number
  default = 1024
}

variable "log_retention_days" {
  type    = number
  default = 30
}

locals {
  name = "${var.city_slug}-service-guide"
  secret_arns = compact([
    var.openai_api_key_secret_arn,
    var.admin_api_token_secret_arn,
  ])
}

data "aws_vpc" "this" {
  id = var.vpc_id
}

# ── Logging ──────────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${local.name}"
  retention_in_days = var.log_retention_days
}

# ── IAM ──────────────────────────────────────────────────────────────

data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Execution role: pulls the image, writes logs, reads exactly the listed secrets.
resource "aws_iam_role" "execution" {
  name               = "${local.name}-exec"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "execution_managed" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "execution_secrets" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = local.secret_arns
  }
  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.app.arn}:*"]
  }
}

resource "aws_iam_role_policy" "execution_secrets" {
  name   = "secrets-and-logs"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution_secrets.json
}

# Task role: the application calls no AWS APIs, so it has no permissions.
resource "aws_iam_role" "task" {
  name               = "${local.name}-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

# ── Network ──────────────────────────────────────────────────────────

resource "aws_security_group" "alb" {
  name_prefix = "${local.name}-alb-"
  description = "Public HTTPS/HTTP to the ALB"
  vpc_id      = var.vpc_id

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  security_group_id = aws_security_group.alb.id
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  security_group_id = aws_security_group.alb.id
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
  cidr_ipv4         = "0.0.0.0/0" # only used for the redirect to HTTPS
}

resource "aws_security_group" "task" {
  name_prefix = "${local.name}-task-"
  description = "Tasks accept traffic only from the ALB"
  vpc_id      = var.vpc_id

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_egress_rule" "alb_to_task" {
  security_group_id            = aws_security_group.alb.id
  ip_protocol                  = "tcp"
  from_port                    = 8000
  to_port                      = 8000
  referenced_security_group_id = aws_security_group.task.id
}

resource "aws_vpc_security_group_ingress_rule" "task_from_alb" {
  security_group_id            = aws_security_group.task.id
  ip_protocol                  = "tcp"
  from_port                    = 8000
  to_port                      = 8000
  referenced_security_group_id = aws_security_group.alb.id
}

# Tasks need outbound HTTPS only (OpenAI, ECR, Secrets Manager, CloudWatch Logs).
resource "aws_vpc_security_group_egress_rule" "task_https" {
  security_group_id = aws_security_group.task.id
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = "0.0.0.0/0"
}

# ── Load balancer ────────────────────────────────────────────────────

resource "aws_lb" "this" {
  name                       = substr(local.name, 0, 32)
  load_balancer_type         = "application"
  subnets                    = var.public_subnet_ids
  security_groups            = [aws_security_group.alb.id]
  drop_invalid_header_fields = true
}

resource "aws_lb_target_group" "app" {
  name_prefix = "sg-"
  port        = 8000
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = var.vpc_id

  health_check {
    path                = "/api/v1/health"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

resource "aws_lb_listener" "http_redirect" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# ── ECS ──────────────────────────────────────────────────────────────

resource "aws_ecs_cluster" "this" {
  name = local.name

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_ecs_task_definition" "app" {
  family                   = local.name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64" # build the image for linux/amd64, or change to ARM64
  }

  # The app is stateless; /tmp is the only writable path.
  volume {
    name = "tmp"
  }

  container_definitions = jsonencode([
    {
      name                   = "app"
      image                  = var.image_uri
      essential              = true
      user                   = "10001:10001"
      readonlyRootFilesystem = true
      portMappings           = [{ containerPort = 8000, protocol = "tcp" }]
      mountPoints            = [{ sourceVolume = "tmp", containerPath = "/tmp", readOnly = false }]

      # Non-secret configuration only.
      environment = [
        { name = "DEMO_MODE", value = tostring(var.demo_mode) },
        { name = "PUBLIC_ORIGIN", value = var.public_origin },
        { name = "CORS_ORIGINS", value = var.public_origin },
        # Trust X-Forwarded-* only from inside the VPC (the ALB).
        { name = "FORWARDED_ALLOW_IPS", value = data.aws_vpc.this.cidr_block },
        { name = "REALTIME_DEBUG_LOG_ENABLED", value = "false" },
        # Voice: on-device speech recognition, text-only to the server. Raw-audio streaming to OpenAI stays off.
        { name = "VOICE_PIPELINE_MODE", value = "intercepted_text" },
        { name = "ALLOW_RAW_AUDIO_STREAM", value = "false" },
      ]

      # Secret values are resolved by ECS at start; they never appear in this file or state output.
      secrets = concat(
        [{ name = "OPENAI_API_KEY", valueFrom = var.openai_api_key_secret_arn }],
        var.admin_api_token_secret_arn == "" ? [] : [{ name = "ADMIN_API_TOKEN", valueFrom = var.admin_api_token_secret_arn }],
      )

      healthCheck = {
        command     = ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health', timeout=4)"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 30
      }

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.app.name
          awslogs-region        = var.region
          awslogs-stream-prefix = "app"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "app" {
  name            = local.name
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  health_check_grace_period_seconds = 60

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.task.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "app"
    container_port   = 8000
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  depends_on = [aws_lb_listener.https]
}

# ── Outputs ──────────────────────────────────────────────────────────

output "alb_dns_name" {
  description = "Point the city's CNAME (or Route 53 alias) at this name."
  value       = aws_lb.this.dns_name
}

output "log_group" {
  value = aws_cloudwatch_log_group.app.name
}
