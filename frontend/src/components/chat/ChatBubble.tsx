import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import Chip from "@mui/material/Chip";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import type { IntakeMessage } from "@/types";

interface ChatBubbleProps {
  message: IntakeMessage;
  onButtonClick?: (value: string) => void;
  isLatest?: boolean;
}

export default function ChatBubble({
  message,
  onButtonClick,
  isLatest,
}: ChatBubbleProps) {
  const isUser = message.role === "user";

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: isUser ? "row-reverse" : "row",
        alignItems: "flex-start",
        gap: 1.5,
        mb: 2,
        animation: "fadeSlideIn 0.3s ease-out",
        "@keyframes fadeSlideIn": {
          from: { opacity: 0, transform: "translateY(8px)" },
          to: { opacity: 1, transform: "translateY(0)" },
        },
      }}
    >
      {/* Avatar */}
      {!isUser && (
        <Avatar
          sx={{
            width: 36,
            height: 36,
            bgcolor: "primary.main",
            mt: 0.5,
          }}
        >
          <SmartToyIcon sx={{ fontSize: 20 }} />
        </Avatar>
      )}

      {/* Bubble */}
      <Box sx={{ maxWidth: "75%", minWidth: 60 }}>
        <Box
          sx={{
            px: 2,
            py: 1.5,
            borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
            bgcolor: isUser ? "primary.main" : "grey.100",
            color: isUser ? "primary.contrastText" : "text.primary",
            ...(isUser
              ? {}
              : {
                  border: "1px solid",
                  borderColor: "divider",
                }),
          }}
        >
          <Typography
            variant="body1"
            sx={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              lineHeight: 1.6,
              fontSize: "0.95rem",
            }}
          >
            {message.content}
          </Typography>
        </Box>

        {/* Suggested buttons */}
        {!isUser &&
          isLatest &&
          message.suggested_buttons &&
          message.suggested_buttons.length > 0 && (
            <Box
              sx={{
                display: "flex",
                flexWrap: "wrap",
                gap: 0.75,
                mt: 1.5,
                animation: "fadeSlideIn 0.4s ease-out 0.15s both",
              }}
            >
              {message.suggested_buttons.map((btn) => (
                <Chip
                  key={btn}
                  label={btn}
                  onClick={() => onButtonClick?.(btn)}
                  clickable
                  variant="outlined"
                  color="primary"
                  sx={{
                    fontWeight: 500,
                    borderRadius: "20px",
                    "&:hover": {
                      bgcolor: "primary.main",
                      color: "primary.contrastText",
                    },
                    transition: "all 0.2s ease",
                  }}
                />
              ))}
            </Box>
          )}
      </Box>
    </Box>
  );
}
