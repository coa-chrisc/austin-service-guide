import type { SvgIconComponent } from "@mui/icons-material";
import AccountTreeOutlined from "@mui/icons-material/AccountTreeOutlined";
import ChecklistOutlined from "@mui/icons-material/ChecklistOutlined";
import CloudOffOutlined from "@mui/icons-material/CloudOffOutlined";
import ExploreOutlined from "@mui/icons-material/ExploreOutlined";
import MenuBookOutlined from "@mui/icons-material/MenuBookOutlined";
import PhoneInTalkOutlined from "@mui/icons-material/PhoneInTalkOutlined";
import PolicyOutlined from "@mui/icons-material/PolicyOutlined";
import RateReviewOutlined from "@mui/icons-material/RateReviewOutlined";
import RuleOutlined from "@mui/icons-material/RuleOutlined";
import ShieldOutlined from "@mui/icons-material/ShieldOutlined";
import SpeedOutlined from "@mui/icons-material/SpeedOutlined";
import TrendingUpOutlined from "@mui/icons-material/TrendingUpOutlined";
import VisibilityOffOutlined from "@mui/icons-material/VisibilityOffOutlined";
import type { IconKey } from "./content";

/** The icon for each IconKey in content.ts. Decorative: the text beside each icon carries the meaning. */
export const ICONS: Record<IconKey, SvgIconComponent> = {
  explore: ExploreOutlined,
  architecture: AccountTreeOutlined,
  shield: ShieldOutlined,
  scale: TrendingUpOutlined,
  status: ChecklistOutlined,
  crisis: PhoneInTalkOutlined,
  redact: VisibilityOffOutlined,
  catalog: MenuBookOutlined,
  rules: RuleOutlined,
  noStore: CloudOffOutlined,
  policy: PolicyOutlined,
  limits: SpeedOutlined,
  review: RateReviewOutlined,
};
