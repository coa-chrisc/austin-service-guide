import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import { clearIntakeState } from "@/lib/session";

interface StartOverButtonProps {
  /** "toolbar" renders a header button; "drawer" a mobile drawer row. */
  variant?: "toolbar" | "drawer";
  /** Called after the dialog closes (confirmed or cancelled). */
  onClosed?: () => void;
}

/**
 * Wipes this tab's intake (conversation, profile, matches, plan) from
 * sessionStorage after a confirmation dialog, then returns to the home page.
 * Leaving the intake page unmounts the chat, which also stops any voice
 * session.
 */
export default function StartOverButton({
  variant = "toolbar",
  onClosed,
}: StartOverButtonProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const close = () => {
    setOpen(false);
    onClosed?.();
  };

  const confirm = () => {
    clearIntakeState();
    close();
    navigate("/");
  };

  const trigger =
    variant === "drawer" ? (
      <ListItemButton
        onClick={() => setOpen(true)}
        aria-label="Start over and clear my answers"
      >
        <ListItemIcon>
          <RestartAltIcon />
        </ListItemIcon>
        <ListItemText primary="Start over" />
      </ListItemButton>
    ) : (
      <Button
        variant="text"
        size="small"
        color="inherit"
        disableElevation
        startIcon={<RestartAltIcon />}
        onClick={() => setOpen(true)}
        aria-label="Start over and clear my answers"
        sx={{ textTransform: "none", fontWeight: 600, mr: 0.5 }}
      >
        Start over
      </Button>
    );

  return (
    <>
      {trigger}
      <Dialog
        open={open}
        onClose={close}
        aria-labelledby="start-over-title"
        aria-describedby="start-over-description"
      >
        <DialogTitle id="start-over-title">Start over?</DialogTitle>
        <DialogContent>
          <DialogContentText id="start-over-description">
            This clears your answers and your plan from this browser tab. They
            are not saved anywhere else, so you will not be able to get them
            back.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={close}
            disableElevation
            aria-label="Keep my answers"
            sx={{ textTransform: "none", fontWeight: 600 }}
          >
            Keep my answers
          </Button>
          <Button
            onClick={confirm}
            variant="contained"
            color="error"
            disableElevation
            aria-label="Clear my answers and start over"
            sx={{ textTransform: "none", fontWeight: 600 }}
          >
            Clear and start over
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
