import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";

export const PII_REMOVED_MESSAGE =
  "To protect your privacy, personal identifiers like phone numbers or street addresses were removed before sending.";

export default function PrivacySnackbar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Snackbar
      open={open}
      autoHideDuration={8000}
      onClose={onClose}
      // Top centre, below the sticky header (56px phones, 64px from sm):
      // at the bottom it covered the chat input it is about.
      anchorOrigin={{ vertical: "top", horizontal: "center" }}
      sx={{ top: { xs: 64, sm: 80 } }}
    >
      <Alert severity="info" variant="filled" onClose={onClose}>
        {PII_REMOVED_MESSAGE}
      </Alert>
    </Snackbar>
  );
}
