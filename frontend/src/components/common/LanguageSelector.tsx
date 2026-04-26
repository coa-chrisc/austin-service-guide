import { useState } from "react";
import Button from "@mui/material/Button";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Divider from "@mui/material/Divider";
import ListItemText from "@mui/material/ListItemText";
import TranslateIcon from "@mui/icons-material/Translate";
import CheckIcon from "@mui/icons-material/Check";
import ListItemIcon from "@mui/material/ListItemIcon";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "zh", label: "中文" },
  { code: "hi", label: "हिन्दी" },
  { code: "ar", label: "العربية" },
  { code: "vi", label: "Tiếng Việt" },
  { code: "fr", label: "Français" },
  { code: "ko", label: "한국어" },
];

export function getStoredLanguage(): string {
  try {
    return localStorage.getItem("asg-language") || "en";
  } catch {
    return "en";
  }
}

export function getLanguageLabel(code: string): string {
  const lang = LANGUAGES.find((l) => l.code === code);
  return lang?.label ?? code;
}

export default function LanguageSelector() {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selected, setSelected] = useState(getStoredLanguage);
  const open = Boolean(anchorEl);

  const handleClick = (e: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(e.currentTarget);
  };

  const handleClose = () => setAnchorEl(null);

  const handleSelect = (code: string) => {
    setSelected(code);
    try {
      localStorage.setItem("asg-language", code);
    } catch {
      /* no-op */
    }
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
          minWidth: "auto",
        }}
      >
        {current?.label ?? "English"}
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
