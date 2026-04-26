import { useEffect, useState } from "react";
import { useNavigate, useLocation, Link as RouterLink } from "react-router-dom";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import ListItemIcon from "@mui/material/ListItemIcon";
import Divider from "@mui/material/Divider";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Avatar from "@mui/material/Avatar";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import MenuIcon from "@mui/icons-material/Menu";
import HomeIcon from "@mui/icons-material/Home";
import ListAltIcon from "@mui/icons-material/ListAlt";
import MapIcon from "@mui/icons-material/Map";
import LoginIcon from "@mui/icons-material/Login";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
import LanguageSelector from "@/components/common/LanguageSelector";
import { useAuth } from "@/hooks/useAuth";
import { useThemeMode } from "@/theme/ThemeContext";
import { getActiveSession } from "@/lib/session";

const NAV_ITEMS = [
  { label: "Home", path: "/", icon: <HomeIcon /> },
  { label: "Services", path: "/services", icon: <ListAltIcon /> },
  { label: "Map", path: "/map", icon: <MapIcon /> },
];

export default function Header() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isStaff, residentName, logout } = useAuth();
  const { mode, toggleMode } = useThemeMode();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(
    null,
  );
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() =>
    getActiveSession(),
  );

  // Re-read on every route change so the pill appears the moment a user
  // lands on /results or disappears after "Start over."
  useEffect(() => {
    setActiveSessionId(getActiveSession());
  }, [location.pathname]);

  const onResultsPage =
    !!activeSessionId && location.pathname === `/results/${activeSessionId}`;
  const showPlanPill = !!activeSessionId && !onResultsPage;

  const handleUserMenuOpen = (e: React.MouseEvent<HTMLElement>) => {
    setUserMenuAnchor(e.currentTarget);
  };
  const handleUserMenuClose = () => setUserMenuAnchor(null);

  const handleLogout = () => {
    logout();
    handleUserMenuClose();
    navigate("/");
  };

  return (
    <>
      <AppBar
        position="sticky"
        color="default"
        sx={{
          bgcolor: "background.paper",
          color: "text.primary",
          zIndex: theme.zIndex.appBar,
          "&::after": {
            content: '""',
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 3,
            background: "linear-gradient(90deg, #44499C 0%, #009F4D 100%)",
          },
        }}
      >
        <Toolbar sx={{ gap: 1 }}>
          {isMobile && (
            <IconButton
              edge="start"
              onClick={() => setDrawerOpen(true)}
              aria-label="menu"
            >
              <MenuIcon />
            </IconButton>
          )}

          {/* Logo */}
          <Box
            component={RouterLink}
            to="/"
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              textDecoration: "none",
              color: "inherit",
              mr: 2,
            }}
          >
            <Box
              component="img"
              src="/aph-logo.png"
              alt="Austin Public Health"
              sx={{
                height: { xs: 32, sm: 36 },
                width: "auto",
              }}
            />
            <Typography
              variant="body2"
              sx={{
                fontWeight: 600,
                color: "text.secondary",
                display: { xs: "none", md: "block" },
                whiteSpace: "nowrap",
                borderLeft: "1px solid",
                borderColor: "divider",
                pl: 1.5,
              }}
            >
              Service Guide
            </Typography>
          </Box>

          {/* Desktop nav */}
          {!isMobile && (
            <Box sx={{ display: "flex", gap: 0.5 }}>
              {NAV_ITEMS.map((item) => (
                <Button
                  key={item.path}
                  component={RouterLink}
                  to={item.path}
                  sx={{
                    color:
                      location.pathname === item.path
                        ? "primary.main"
                        : "text.secondary",
                    fontWeight: location.pathname === item.path ? 700 : 500,
                  }}
                >
                  {item.label}
                </Button>
              ))}
            </Box>
          )}

          <Box sx={{ flex: 1 }} />

          {/* My Plan pill — visible whenever an active session exists */}
          {showPlanPill && !isMobile && (
            <Button
              variant="contained"
              size="small"
              startIcon={<AssignmentTurnedInIcon />}
              onClick={() => navigate(`/results/${activeSessionId}`)}
              sx={{
                borderRadius: "20px",
                fontWeight: 700,
                textTransform: "none",
                px: 2,
                mr: 1,
                background: (t) =>
                  `linear-gradient(135deg, ${t.palette.primary.main}, ${t.palette.secondary.main})`,
                color: "white",
                boxShadow: "0 2px 6px rgba(0,91,187,0.25)",
              }}
            >
              View my plan
            </Button>
          )}

          {/* Language selector */}
          <LanguageSelector />

          {/* Dark mode toggle */}
          <IconButton
            onClick={toggleMode}
            size="small"
            sx={{ color: "text.secondary" }}
          >
            {mode === "dark" ? <LightModeIcon /> : <DarkModeIcon />}
          </IconButton>

          {/* Auth area */}
          {isAuthenticated ? (
            <>
              <IconButton onClick={handleUserMenuOpen} size="small">
                <Avatar
                  sx={{
                    width: 32,
                    height: 32,
                    bgcolor: "primary.main",
                    fontSize: 14,
                  }}
                >
                  {residentName?.charAt(0).toUpperCase() ?? "U"}
                </Avatar>
              </IconButton>
              <Menu
                anchorEl={userMenuAnchor}
                open={Boolean(userMenuAnchor)}
                onClose={handleUserMenuClose}
              >
                <MenuItem disabled>
                  <Typography variant="body2" fontWeight={600}>
                    {residentName}
                  </Typography>
                </MenuItem>
                <Divider />
                {isStaff && (
                  <MenuItem
                    onClick={() => {
                      handleUserMenuClose();
                      navigate("/admin");
                    }}
                  >
                    <ListItemIcon>
                      <AdminPanelSettingsIcon fontSize="small" />
                    </ListItemIcon>
                    Admin Console
                  </MenuItem>
                )}
                <MenuItem onClick={handleLogout}>Logout</MenuItem>
              </Menu>
            </>
          ) : (
            <Button
              variant="outlined"
              size="small"
              startIcon={<LoginIcon />}
              onClick={() => navigate("/login")}
              sx={{ ml: 1 }}
            >
              Sign In
            </Button>
          )}
        </Toolbar>
      </AppBar>

      {/* Mobile drawer */}
      <Drawer
        anchor="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        slotProps={{ paper: { sx: { width: 260 } } }}
      >
        <Box sx={{ p: 2, display: "flex", alignItems: "center", gap: 1 }}>
          <Box
            component="img"
            src="/aph-logo.png"
            alt="Austin Public Health"
            sx={{ height: 32, width: "auto" }}
          />
        </Box>
        <Divider />
        <List>
          {showPlanPill && (
            <ListItemButton
              onClick={() => {
                navigate(`/results/${activeSessionId}`);
                setDrawerOpen(false);
              }}
              sx={{
                bgcolor: "primary.50",
                "&:hover": { bgcolor: "primary.100" },
              }}
            >
              <ListItemIcon>
                <AssignmentTurnedInIcon color="primary" />
              </ListItemIcon>
              <ListItemText
                primary="View my plan"
                primaryTypographyProps={{
                  fontWeight: 700,
                  color: "primary.main",
                }}
              />
            </ListItemButton>
          )}
          {NAV_ITEMS.map((item) => (
            <ListItemButton
              key={item.path}
              onClick={() => {
                navigate(item.path);
                setDrawerOpen(false);
              }}
              selected={location.pathname === item.path}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          ))}
        </List>
        <Divider />
        <List>
          {!isAuthenticated && (
            <ListItemButton
              onClick={() => {
                navigate("/login");
                setDrawerOpen(false);
              }}
            >
              <ListItemIcon>
                <LoginIcon />
              </ListItemIcon>
              <ListItemText primary="Sign In" />
            </ListItemButton>
          )}
          {isAuthenticated && isStaff && (
            <ListItemButton
              onClick={() => {
                navigate("/admin");
                setDrawerOpen(false);
              }}
            >
              <ListItemIcon>
                <AdminPanelSettingsIcon />
              </ListItemIcon>
              <ListItemText primary="Admin Console" />
            </ListItemButton>
          )}
        </List>
      </Drawer>
    </>
  );
}
