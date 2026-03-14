import Button from "@mui/material/Button";
import { usePaletteMode } from "hooks/usePaletteMode";
import { useState } from "react";
import Collapse from "@mui/material/Collapse";
import Tooltip from "@mui/material/Tooltip";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import MagnifyIcon from "@mui/icons-material/ManageSearchRounded";
import { useAppDispatch } from "hooks/useAppDispatch";
import { useAppSelector } from "hooks/useAppSelector";
import { manualCodeListActions } from "store/slices/manualCodeListSlice";
import type { CodeStateValue } from "store/slices/manualCodeListSlice";

// Les 125 codes (111 à 555), groupés par premier chiffre
function buildAllCodes(): { [key: number]: string[] } {
  const result: { [key: number]: string[] } = {
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
  };
  for (let b = 1; b <= 5; b += 1) {
    for (let y = 1; y <= 5; y += 1) {
      for (let p = 1; p <= 5; p += 1) {
        result[b].push(`${b}${y}${p}`);
      }
    }
  }
  return result;
}

const allCodes = buildAllCodes();

export function ManualCodeList() {
  const { theme } = usePaletteMode();
  const dispatch = useAppDispatch();
  const codeStates = useAppSelector((state) => state.manualCodeList);

  const [expanded, setExpanded] = useState(false);
  const [hide, setHide] = useState(false);

  function getState(code: string): CodeStateValue {
    return codeStates[code] ?? "normal";
  }

  function handleClick(code: string) {
    dispatch(manualCodeListActions.toggleCode(code));
  }

  function toggleExpanded() {
    setExpanded((v) => !v);
  }

  function toggleHidden() {
    setHide((v) => !v);
  }

  return (
    <Paper
      component="section"
      id="manual-code-list-section"
      sx={{ width: 320, margin: theme.spacing(0, "auto", 2) }}
    >
      <Box p={2} mt={2}>
        <Box display="flex" justifyContent="space-between" zIndex={1}>
          <Button onClick={toggleExpanded}>
            {expanded ? "Hide code list" : "Show code list"}
          </Button>
          {expanded && (
            <IconButton onClick={toggleHidden} disabled={!expanded}>
              <Tooltip
                id="manual-code-list-filter"
                title={hide ? "Show greyed codes" : "Hide greyed codes"}
              >
                <MagnifyIcon />
              </Tooltip>
            </IconButton>
          )}
        </Box>

        <Collapse in={expanded}>
          {/* 5 colonnes côte à côte via CSS grid — pas de chevauchement possible */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 0,
              mt: 1,
            }}
          >
            {[1, 2, 3, 4, 5].map((number) => (
              <Box key={number} sx={{ display: "flex", flexDirection: "column" }}>
                {allCodes[number].map((code) => {
                  const codeState = getState(code);
                  if (hide && codeState === "greyed") return null;

                  return (
                    <Box
                      key={code}
                      component="span"
                      onClick={() => handleClick(code)}
                      sx={{
                        cursor: "pointer",
                        userSelect: "none",
                        lineHeight: 1.6,
                        px: "3px",
                        borderRadius: "3px",
                        color:
                          codeState === "greyed"
                            ? theme.palette.text.disabled
                            : theme.palette.text.primary,
                        border:
                          codeState === "outlined"
                            ? `1.5px solid ${theme.palette.text.primary}`
                            : "1.5px solid transparent",
                        fontSize: "0.85rem",
                        fontFamily: "monospace",
                      }}
                    >
                      {code}
                    </Box>
                  );
                })}
              </Box>
            ))}
          </Box>
        </Collapse>
      </Box>
    </Paper>
  );
}
