import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Divider from "@mui/material/Divider";
import ListItemText from "@mui/material/ListItemText";
import TranslateIcon from "@mui/icons-material/Translate";
import CheckIcon from "@mui/icons-material/Check";
import ListItemIcon from "@mui/material/ListItemIcon";
import { brandConfig } from "@/hooks/useBrandConfig";

const ALL_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "zh", label: "中文" },
  { code: "hi", label: "हिन्दी" },
  { code: "ar", label: "العربية" },
  { code: "vi", label: "Tiếng Việt" },
  { code: "fr", label: "Français" },
  { code: "ko", label: "한국어" },
];

// Only the configured languages, in configured order.
const LANGUAGES = brandConfig.serviceGuide.languages.flatMap((code) => ALL_LANGUAGES.filter((l) => l.code === code));

/** Fired on window when the UI language changes in this tab. */
export const LANGUAGE_CHANGE_EVENT = "asg:language";

export function getStoredLanguage(): string {
  try {
    return localStorage.getItem("asg-language") || "en";
  } catch {
    return "en";
  }
}

/**
 * Save the UI language and tell this tab's listeners. Used by the selector
 * and when the voice model switches language for the resident.
 */
export function setStoredLanguage(code: string): void {
  try {
    localStorage.setItem("asg-language", code);
  } catch {
    /* no-op */
  }
  window.dispatchEvent(new CustomEvent(LANGUAGE_CHANGE_EVENT, { detail: code }));
}

/** The stored UI language, re-rendering when it changes in this tab. */
export function useStoredLanguage(): string {
  const [language, setLanguage] = useState(getStoredLanguage);
  useEffect(() => {
    const onChange = () => setLanguage(getStoredLanguage());
    window.addEventListener(LANGUAGE_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(LANGUAGE_CHANGE_EVENT, onChange);
  }, []);
  return language;
}

export function getLanguageLabel(code: string): string {
  const lang = LANGUAGES.find((l) => l.code === code);
  return lang?.label ?? code;
}

export default function LanguageSelector() {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const selected = useStoredLanguage();
  const open = Boolean(anchorEl);

  const handleClick = (e: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(e.currentTarget);
  };

  const handleClose = () => setAnchorEl(null);

  const handleSelect = (code: string) => {
    setStoredLanguage(code);
    handleClose();
  };

  const current = LANGUAGES.find((l) => l.code === selected);

  return (
    <>
      <Button
        onClick={handleClick}
        startIcon={<TranslateIcon />}
        sx={{
          color: "inherit",
          textTransform: "none",
          fontWeight: 500,
          // Shrinks (label ellipsis) instead of pushing the header past a
          // narrow screen, down to the icon alone; touch keeps a 44px target.
          minWidth: 40,
          flexShrink: 1,
          "@media (pointer: coarse)": { minWidth: 44, minHeight: 44 },
        }}
      >
        <Box
          component="span"
          sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {current?.label ?? "English"}
        </Box>
      </Button>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        slotProps={{ paper: { sx: { minWidth: 180 } } }}
      >
        {LANGUAGES.map((lang) => (
          <MenuItem
            key={lang.code}
            onClick={() => handleSelect(lang.code)}
            selected={lang.code === selected}
          >
            {lang.code === selected && (
              <ListItemIcon>
                <CheckIcon fontSize="small" />
              </ListItemIcon>
            )}
            <ListItemText inset={lang.code !== selected}>
              {lang.label}
            </ListItemText>
          </MenuItem>
        ))}
        <Divider />
        <MenuItem onClick={handleClose} disabled>
          <ListItemText inset>Other...</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}
