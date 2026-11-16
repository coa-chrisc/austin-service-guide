import type { SvgIconComponent } from "@mui/icons-material";
import CloudOffOutlined from "@mui/icons-material/CloudOffOutlined";
import MenuBookOutlined from "@mui/icons-material/MenuBookOutlined";
import PhoneInTalkOutlined from "@mui/icons-material/PhoneInTalkOutlined";
import PolicyOutlined from "@mui/icons-material/PolicyOutlined";
import RateReviewOutlined from "@mui/icons-material/RateReviewOutlined";
import RuleOutlined from "@mui/icons-material/RuleOutlined";
import SpeedOutlined from "@mui/icons-material/SpeedOutlined";
import VisibilityOffOutlined from "@mui/icons-material/VisibilityOffOutlined";
import type { IconKey } from "./content";

/** The icon for each IconKey in content.ts. Decorative: the text beside each icon carries the meaning. */
export const ICONS: Record<IconKey, SvgIconComponent> = {
  crisis: PhoneInTalkOutlined,
  redact: VisibilityOffOutlined,
  catalog: MenuBookOutlined,
  rules: RuleOutlined,
  noStore: CloudOffOutlined,
  policy: PolicyOutlined,
  limits: SpeedOutlined,
  review: RateReviewOutlined,
};
