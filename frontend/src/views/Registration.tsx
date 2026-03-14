import PersonIcon from "@mui/icons-material/PersonRounded";
import Box from "@mui/material/Box";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormControl from "@mui/material/FormControl";
import FormLabel from "@mui/material/FormLabel";
import TextField from "components/TextField";
import { useAppDispatch } from "hooks/useAppDispatch";
import { useAppSelector } from "hooks/useAppSelector";
import { FC, useEffect, useState } from "react";
import { registrationActions } from "store/slices/registrationSlice";
import { roundsActions } from "store/slices/roundsSlice";
import { commentsActions } from "store/slices/commentsSlice";
import { digitCodeActions } from "store/slices/digitCodeSlice";
import HashCodeRegistration from "components/HashCodeRegistration";
import ManualRegistration from "components/ManualRegistration";
import { Card } from "@mui/material";
import PasteRegistration from "components/PasteRegistration";
import AutoRegistration from "components/AutoRegistration";
import { parse as parseTuringInfo } from "parsing/turing-copy-paste";
import { parse as parseProblemBook } from "parsing/problem-book";

const Registration: FC = () => {
  const dispatch = useAppDispatch();
  const registration = useAppSelector((state) => state.registration);
  const [registrationMethod, setRegristationMethod] = useState("paste");

  function changeRegistrationMethod(e: React.ChangeEvent<HTMLInputElement>) {
    setRegristationMethod((e.target as HTMLInputElement).value);
  }

  // Handle ?party_info= URL param on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const partyInfo = params.get("party_info");
    if (partyInfo) {
      const cardText = decodeURIComponent(partyInfo);
      const problem = parseTuringInfo(cardText) || parseProblemBook(cardText);
      if (problem) {
        // Stocker le party_info original pour permettre le repartage
        dispatch(registrationActions.updatePartyInfo(cardText));
        dispatch(registrationActions.updateHash(problem.code.toUpperCase()));
        dispatch(roundsActions.reset());
        dispatch(commentsActions.reset());
        dispatch(digitCodeActions.reset());
        dispatch(registrationActions.fetchDone());
        dispatch(commentsActions.setCards(problem));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Box
      id="registration-section"
      component="section"
      width={350}
      margin="auto"
      mb={2}
    >
      <TextField
        prefixId="registration__name"
        disabled={registration.status !== "new"}
        iconRender={<PersonIcon />}
        withStackRadius
        value={registration.name}
        onChange={(value) =>
          dispatch(registrationActions.updateName(value.toUpperCase()))
        }
        withReset={registration.status === "new"}
        onReset={() => dispatch(registrationActions.updateName(""))}
      />
      {registration.status === "new" && (
        <FormControl>
          <FormLabel id="demo-controlled-radio-buttons-group">
            Game Setup
          </FormLabel>
          <RadioGroup
            row
            aria-labelledby="demo-controlled-radio-buttons-group"
            name="controlled-radio-buttons-group"
            value={registrationMethod}
            onChange={changeRegistrationMethod}
          >
            <FormControlLabel
              value="manual"
              control={<Radio />}
              label="Manual"
            />
            <FormControlLabel value="paste" control={<Radio />} label="Paste" />
            <FormControlLabel
              value="turing-hash"
              control={<Radio />}
              label="Hashcode"
            />
            <FormControlLabel value="auto" control={<Radio />} label="Auto" />
          </RadioGroup>
        </FormControl>
      )}
      {registrationMethod === "turing-hash" && <HashCodeRegistration />}
      {registrationMethod === "manual" && registration.status === "new" && (
        <Card>
          <Box m={2}>
            <ManualRegistration />
          </Box>
        </Card>
      )}
      {(registrationMethod === "paste" || registrationMethod === "auto") && (
        <PasteRegistration />
      )}
      {registrationMethod === "auto" && registration.status === "new" && (
        <AutoRegistration />
      )}
    </Box>
  );
};

export default Registration;
