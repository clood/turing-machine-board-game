import { Typography } from "@mui/material";
import Box from "@mui/material/Box";
import HashIcon from "@mui/icons-material/NumbersRounded";
import ShareIcon from "@mui/icons-material/ShareRounded";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import Tooltip from "@mui/material/Tooltip";
import { alpha, useTheme } from "@mui/material/styles";
import TextField from "components/TextField";
import { useAppDispatch } from "hooks/useAppDispatch";
import { useAppSelector } from "hooks/useAppSelector";
import { FC, useState } from "react";
import { commentsActions } from "store/slices/commentsSlice";
import { digitCodeActions } from "store/slices/digitCodeSlice";
import { registrationActions } from "store/slices/registrationSlice";
import { roundsActions } from "store/slices/roundsSlice";
import { parse as parseTuringInfo } from "parsing/turing-copy-paste";
import { parse as parseProblemBook } from "parsing/problem-book";
import { manualCodeListActions } from "store/slices/manualCodeListSlice";

const PasteRegistration: FC = () => {
  const dispatch = useAppDispatch();
  const registration = useAppSelector((state) => state.registration);
  const [cardText, setCardText] = useState("");
  const [showNotFound, setShowNotFound] = useState(false);
  const [showCopied, setShowCopied] = useState(false);
  const theme = useTheme();

  function onSubmit() {
    const problem = parseTuringInfo(cardText) || parseProblemBook(cardText);
    if (problem === null) {
      setShowNotFound(true);
      return;
    }
    // Stocker le party_info original pour le partage
    dispatch(registrationActions.updatePartyInfo(cardText));
    setCardText("");
    dispatch(registrationActions.updateHash(problem.code.toUpperCase()));
    dispatch(roundsActions.reset());
    dispatch(commentsActions.reset());
    dispatch(digitCodeActions.reset());
    dispatch(manualCodeListActions.reset());
    dispatch(registrationActions.fetchDone());
    dispatch(commentsActions.setCards(problem));
  }

  const onShare = () => {
    const baseUrl =
      process.env.PUBLIC_URL
        ? `${window.location.origin}${process.env.PUBLIC_URL}/`
        : `${window.location.origin}/`;
    const url = `${baseUrl}?party_info=${encodeURIComponent(registration.partyInfo)}`;
    navigator.clipboard.writeText(url).then(() => {
      setShowCopied(true);
    });
  };

  // Quand la partie est configurée, afficher le hash + icône de partage
    // Quand la partie est configurée, afficher le hash + icône de partage
  if (registration.status !== "new") {
    return (
      <>
        {/* Toast "lien copié" */}
        <Snackbar
          anchorOrigin={{ horizontal: "center", vertical: "top" }}
          open={showCopied}
          autoHideDuration={3000}
          onClose={() => setShowCopied(false)}
        >
          <Alert
            onClose={() => setShowCopied(false)}
            severity="success"
            sx={{ width: "100%" }}
            variant="filled"
          >
            Lien copié dans le presse-papier
          </Alert>
        </Snackbar>

        {/* Wrapper relatif identique à ce que TextField crée en interne */}
        <Box position="relative">
          <TextField
            prefixId="registration__hash"
            disabled={true}
            iconRender={<HashIcon />}
            value={registration.hash}
            maxChars={10}
            customRadius={
              registration.status === "ready"
                ? theme.spacing(0, 0, 2, 2)
                : undefined
            }
          />
          {/* Icône partage superposée à droite, exactement comme le bouton clear */}
          {registration.status === "ready" && (
            <Box
              alignItems="center"
              display="flex"
              height={48}
              right={4}
              position="absolute"
              top={0}
            >
              <Tooltip title="Copier le lien de partage">
                <IconButton
                  color="primary"
                  onClick={onShare}
                  aria-label="share game link"
                >
                  <ShareIcon />
                </IconButton>
              </Tooltip>
            </Box>
          )}
        </Box>
      </>
    );
  }
  

  return (
    <>
      <Snackbar
        anchorOrigin={{ horizontal: "center", vertical: "bottom" }}
        open={showNotFound}
        onClose={() => {
          setShowNotFound(false);
        }}
      >
        <Alert
          onClose={() => {
            setShowNotFound(false);
          }}
          severity="error"
          sx={{ width: "100%" }}
          variant="filled"
        >
          Could not parse the game setup. Did you copy&paste the whole setup
          from <a href="https://turingmachine.info/">turingmachine.info</a> or
          the{" "}
          <a href="https://boardgamegeek.com/filepage/251409/book-8500-problems-offline-or-analog-use">
            problem book
          </a>
          ?
        </Alert>
      </Snackbar>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <Alert severity="info">
          You can paste a game setup string in the following text box. Supported
          methods are: <br />
          1. You can copy a generated game from{" "}
          <a href="https://turingmachine.info/">turingmachine.info</a>. The
          copied text needs to include the "#" and all the cards and verifiers.
          <br />
          2. You can copy from the{" "}
          <a href="https://boardgamegeek.com/filepage/251409/book-8500-problems-offline-or-analog-use">
            problem book
          </a>
          . Be sure to include the whole problem line.
        </Alert>
        <Typography>Paste Game Setup</Typography>
        <TextField
          iconRender={<div />}
          value={cardText}
          onChange={(value) => {
            setCardText(value);
          }}
          withReset={true}
          onReset={() => {
            setCardText("");
          }}
        />

        <Box pt={0.5}>
          <Button
            aria-label="search"
            disabled={cardText === ""}
            fullWidth
            size="large"
            type="submit"
            sx={(theme) => ({
              background: alpha(theme.palette.primary.main, 0.1),
              borderRadius: theme.spacing(0, 0, 2, 2),
              fontFamily: "Kalam",
              fontSize: 24,
              height: theme.spacing(6),
              "&:hover": {
                background: alpha(theme.palette.primary.main, 0.2),
              },
            })}
          >
            Start Game
          </Button>
        </Box>
      </form>
    </>
  );
};

export default PasteRegistration;
