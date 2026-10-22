// STARTER TEMPLATE - review before use. Not validated against a live Azure subscription.
//   az deployment group create -g <rg> -f container-app.bicep -p image=<acr>/service-guide:1.0.0 \
//     citySlug=my-city openAiKeySecretUri=https://<vault>.vault.azure.net/secrets/openai-api-key publicOrigin=https://services.example.gov
//
// After deploy, grant the output `identityPrincipalId` the "Key Vault Secrets User" role on the vault
// (the Container App will not start until it can read the secret), and grant it AcrPull if the image is in a private ACR.

targetScope = 'resourceGroup'

@description('Short lowercase city name used to prefix resources.')
param citySlug string

param location string = resourceGroup().location

@description('Full image reference, e.g. myacr.azurecr.io/service-guide:1.0.0')
param image string

@description('Private registry login server (e.g. myacr.azurecr.io). Leave empty for a public image.')
param registryServer string = ''

@description('Versionless or versioned Key Vault secret URI holding the OpenAI API key.')
param openAiKeySecretUri string

@description('Public https origin used for service links in SMS/email shares, e.g. https://services.example.gov')
param publicOrigin string

param demoMode bool = false

@minValue(0)
param minReplicas int = 1

@minValue(1)
param maxReplicas int = 3

@description('Optional custom domain. A managed certificate is created; DNS (CNAME + asuid TXT) must already point at the app.')
param customDomain string = ''

var name = '${citySlug}-service-guide'

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${name}-logs'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${name}-id'
  location: location
}

resource env 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${name}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

resource cert 'Microsoft.App/managedEnvironments/managedCertificates@2024-03-01' = if (!empty(customDomain)) {
  parent: env
  name: '${name}-cert'
  location: location
  properties: {
    subjectName: customDomain
    domainControlValidation: 'CNAME'
  }
}

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: name
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identity.id}': {} }
  }
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 8000
        transport: 'auto'
        allowInsecure: false // HTTP is redirected to HTTPS
        customDomains: empty(customDomain) ? [] : [
          {
            name: customDomain
            certificateId: cert.id
            bindingType: 'SniEnabled'
          }
        ]
      }
      registries: empty(registryServer) ? [] : [
        {
          server: registryServer
          identity: identity.id
        }
      ]
      secrets: [
        {
          name: 'openai-api-key'
          keyVaultUrl: openAiKeySecretUri
          identity: identity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'app'
          image: image
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'OPENAI_API_KEY', secretRef: 'openai-api-key' }
            { name: 'DEMO_MODE', value: string(demoMode) }
            { name: 'PUBLIC_ORIGIN', value: publicOrigin }
            { name: 'CORS_ORIGINS', value: publicOrigin }
            { name: 'REALTIME_DEBUG_LOG_ENABLED', value: 'false' }
            // Voice: on-device speech recognition, text-only to the server. Raw-audio streaming to OpenAI stays off.
            { name: 'VOICE_PIPELINE_MODE', value: 'intercepted_text' }
            { name: 'ALLOW_RAW_AUDIO_STREAM', value: 'false' }
            // Container Apps' envoy proxy addresses are not fixed; "*" is acceptable only because
            // ingress is the sole network path to the container.
            { name: 'FORWARDED_ALLOW_IPS', value: '*' }
          ]
          probes: [
            {
              type: 'Startup'
              httpGet: { path: '/api/v1/health', port: 8000 }
              initialDelaySeconds: 3
              periodSeconds: 5
              failureThreshold: 12
            }
            {
              type: 'Liveness'
              httpGet: { path: '/api/v1/health', port: 8000 }
              periodSeconds: 30
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: { path: '/api/v1/health', port: 8000 }
              periodSeconds: 10
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
        rules: [
          {
            name: 'http'
            http: { metadata: { concurrentRequests: '50' } }
          }
        ]
      }
    }
  }
}

output fqdn string = app.properties.configuration.ingress.fqdn
output identityPrincipalId string = identity.properties.principalId
