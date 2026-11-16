import { useState } from "react";
import {
  Outlet,
  useNavigate,
  useLocation,
  Link as RouterLink,
} from "react-router-dom";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import ListSubheader from "@mui/material/ListSubheader";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Avatar from "@mui/material/Avatar";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import Link from "@mui/material/Link";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ButtonBase from "@mui/material/ButtonBase";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import MenuIcon from "@mui/icons-material/Menu";
import DashboardIcon from "@mui/icons-material/Dashboard";
import PeopleIcon from "@mui/icons-material/People";
import ListAltIcon from "@mui/icons-material/ListAlt";
import RuleIcon from "@mui/icons-material/Rule";
import BarChartIcon from "@mui/icons-material/BarChart";
import BalanceIcon from "@mui/icons-material/Balance";
import MapIcon from "@mui/icons-material/Map";
import TranslateIcon from "@mui/icons-material/Translate";
import AssessmentIcon from "@mui/icons-material/Assessment";
import HistoryIcon from "@mui/icons-material/History";
import BadgeIcon from "@mui/icons-material/Badge";
import HomeIcon from "@mui/icons-material/Home";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import LogoutIcon from "@mui/icons-material/Logout";
import GroupAddIcon from "@mui/icons-material/GroupAdd";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import TravelExploreIcon from "@mui/icons-material/TravelExplore";
import { useAuth } from "@/hooks/useAuth";
import { useJobsConfig } from "@/hooks/useJobsConfig";
import { useImportConfig } from "@/pages/admin/import/useImportConfig";

const DRAWER_WIDTH = 260;

const PRIVACY_DOC_URL =
  "https://github.com/coa-chrisc/austin-service-guide/blob/main/docs/PRIVACY.md";

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

const SECTIONS: Array<{ heading: string; items: NavItem[] }> = [
  {
    heading: "OVERVIEW",
    items: [{ label: "Dashboard", path: "/admin", icon: <DashboardIcon /> }],
  },
  {
    heading: "RESIDENTS",
    items: [
      { label: "Sample cases", path: "/admin/residents", icon: <PeopleIcon /> },
    ],
  },
  {
    heading: "SERVICES",
    items: [
      {
        label: "Service Directory",
        path: "/admin/services",
        icon: <ListAltIcon />,
      },
      {
        label: "Eligibility Rules",
        path: "/admin/eligibility",
        icon: <RuleIcon />,
      },
      {
        label: "Research agent",
        path: "/admin/research",
        icon: <TravelExploreIcon />,
      },
    ],
  },
  {
    heading: "ANALYTICS",
    items: [
      { label: "Overview", path: "/admin/analytics", icon: <BarChartIcon /> },
      { label: "Equity", path: "/admin/equity", icon: <BalanceIcon /> },
      { label: "Demand Map", path: "/admin/demand-map", icon: <MapIcon /> },
      { label: "Languages", path: "/admin/languages", icon: <TranslateIcon /> },
      {
        label: "Partner Gaps",
        path: "/admin/partner-gaps",
        icon: <LinkOffIcon />,
      },
    ],
  },
  {
    heading: "SYSTEM",
    items: [
      { label: "Reports", path: "/admin/reports", icon: <AssessmentIcon /> },
      { label: "Audit Log", path: "/admin/audit", icon: <HistoryIcon /> },
      { label: "Staff", path: "/admin/staff", icon: <BadgeIcon /> },
    ],
  },
  {
    heading: "ABOUT",
    items: [
      { label: "How it works", path: "/admin/how-it-works", icon: <InfoOutlinedIcon /> },
    ],
  },
];

// Shown only when the server has partner-list import turned on.
const IMPORT_ITEM: NavItem = { label: "Import Partner List", path: "/admin/import", icon: <GroupAddIcon /> };

export default function AdminLayout() {
  const { config: importConfig } = useImportConfig();
  const sections = importConfig
    ? SECTIONS.map((s) => (s.heading === "SERVICES" ? { ...s, items: [...s.items, IMPORT_ITEM] } : s))
    : SECTIONS;
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("lg"));
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { residentName, staffRole, logout } = useAuth();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  // The research agent entry shows only when the feature is on (issue #18).
  const researchEnabled = useJobsConfig()?.research_enabled === true;
  // Without a staff sign-in the console is the demo: a generic admin persona.
  const displayName = (staffRole && residentName) || "Demo Staff";
  const roleLabel = (staffRole ?? "admin").replace("_", " ").toUpperCase();

  const closeMenuAndGo = (signOut: boolean) => {
    setMenuAnchor(null);
    if (signOut) logout();
    navigate("/");
  };

  const drawerContent = (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Logo */}
      <Box
        sx={{
          p: 2,
          display: "flex",
          alignItems: "center",
          gap: 1,
        }}
      >
        <Box
          component={RouterLink}
          to="/"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <HomeIcon sx={{ color: "primary.main" }} />
          <Typography variant="subtitle2" color="text.secondary">
            Back to Portal
          </Typography>
        </Box>
      </Box>
      <Divider />

      {/* Nav sections */}
      <Box sx={{ flex: 1, overflowY: "auto" }}>
        {sections.map((section) => (
          <List
            key={section.heading}
            dense
            subheader={
              <ListSubheader
                sx={{
                  fontWeight: 700,
                  fontSize: 11,
                  letterSpacing: 1,
                  lineHeight: "32px",
                  color: "text.secondary",
                  bgcolor: "transparent",
                }}
              >
                {section.heading}
              </ListSubheader>
            }
          >
            {section.items
              .filter((item) => researchEnabled || item.path !== "/admin/research")
              .map((item) => {
              const isActive =
                item.path === "/admin"
                  ? location.pathname === "/admin"
                  : location.pathname.startsWith(item.path);
              return (
                <ListItemButton
                  key={item.label}
                  onClick={() => {
                    navigate(item.path);
                    if (isMobile) setMobileOpen(false);
                  }}
                  sx={{
                    mx: 1,
                    borderRadius: 2,
                    mb: 0.25,
                    bgcolor: isActive ? "primary.main" : "transparent",
                    color: isActive ? "primary.contrastText" : "text.primary",
                    "&:hover": {
                      bgcolor: isActive ? "primary.dark" : "action.hover",
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      color: isActive
                        ? "primary.contrastText"
                        : "text.secondary",
                      minWidth: 36,
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{
                      fontSize: 14,
                      fontWeight: isActive ? 600 : 400,
                    }}
                  />
                </ListItemButton>
              );
            })}
          </List>
        ))}
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      {/* Sidebar */}
      {isMobile ? (
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          slotProps={{ paper: { sx: { width: DRAWER_WIDTH } } }}
        >
          {drawerContent}
        </Drawer>
      ) : (
        <Drawer
          variant="permanent"
          open
          slotProps={{
            paper: {
              sx: {
                width: DRAWER_WIDTH,
                boxSizing: "border-box",
                borderRight: "1px solid",
                borderColor: "divider",
              },
            },
          }}
        >
          {drawerContent}
        </Drawer>
      )}

      {/* Main content area */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          ml: isMobile ? 0 : `${DRAWER_WIDTH}px`,
          // The drawer is hidden in print (How it works page), so drop its gutter.
          "@media print": { ml: 0 },
        }}
      >
        {/* Top bar */}
        <AppBar
          position="sticky"
          color="default"
          sx={{
            bgcolor: "background.paper",
            color: "text.primary",
          }}
        >
          <Toolbar>
            {isMobile && (
              <IconButton
                edge="start"
                onClick={() => setMobileOpen(true)}
                aria-label="Open admin menu"
                sx={{ mr: 1 }}
              >
                <MenuIcon />
              </IconButton>
            )}
            <Typography variant="h6" fontWeight={600} sx={{ flex: 1 }}>
              Staff Console (demo)
            </Typography>
            <Chip
              label={roleLabel}
              size="small"
              color="primary"
              variant="outlined"
              sx={{ mr: 2, fontWeight: 600, fontSize: 11 }}
            />
            <ButtonBase
              onClick={(e) => setMenuAnchor(e.currentTarget)}
              aria-label="Account menu"
              aria-haspopup="menu"
              aria-expanded={menuAnchor ? "true" : undefined}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                borderRadius: 2,
                px: 1,
                py: 0.5,
              }}
            >
              <Avatar
                sx={{
                  width: 32,
                  height: 32,
                  bgcolor: "secondary.main",
                  fontSize: 14,
                }}
              >
                {displayName.charAt(0).toUpperCase()}
              </Avatar>
              <Typography
                variant="body2"
                fontWeight={500}
                sx={{ display: { xs: "none", sm: "block" } }}
              >
                {displayName}
              </Typography>
            </ButtonBase>
            <Menu
              anchorEl={menuAnchor}
              open={Boolean(menuAnchor)}
              onClose={() => setMenuAnchor(null)}
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              transformOrigin={{ vertical: "top", horizontal: "right" }}
            >
              <MenuItem onClick={() => closeMenuAndGo(false)}>
                <ListItemIcon>
                  <HomeIcon fontSize="small" />
                </ListItemIcon>
                Back to resident site
              </MenuItem>
              <MenuItem onClick={() => closeMenuAndGo(true)}>
                <ListItemIcon>
                  <LogoutIcon fontSize="small" />
                </ListItemIcon>
                Sign out
              </MenuItem>
            </Menu>
          </Toolbar>
        </AppBar>

        {/* Page content */}
        <Box
          sx={{ flex: 1, p: { xs: 2, md: 3 }, bgcolor: "background.default" }}
        >
          <Alert severity="info" sx={{ mb: 3 }}>
            Demo console. Residents, analytics, staff and audit entries here are
            synthetic sample data. The Service Directory is the live catalog.
            The resident intake stores nothing on the server.{" "}
            <Link
              href={PRIVACY_DOC_URL}
              target="_blank"
              rel="noopener noreferrer"
              color="inherit"
              fontWeight={600}
            >
              How privacy works
            </Link>
          </Alert>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
