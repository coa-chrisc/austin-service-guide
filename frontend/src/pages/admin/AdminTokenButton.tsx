import { useState } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import KeyIcon from "@mui/icons-material/Key";

import { getAdminToken, setAdminToken } from "../../lib/adminToken";

export default function AdminTokenButton() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  const handleOpen = () => {
    setValue(getAdminToken());
    setOpen(true);
  };

  const handleSave = () => {
    setAdminToken(value.trim());
    setOpen(false);
  };

  return (
    <>
      <Button variant="outlined" startIcon={<KeyIcon />} onClick={handleOpen}>
        Admin token
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Admin token</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Required to create, edit, or delete services. Kept only for this
            browser tab and cleared when it closes.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            type="password"
            label="Token"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
