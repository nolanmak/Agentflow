import type {
  AgentEvent,
  JobStatus,
  TerminalClientMessage,
  TurnInput,
} from "../../public/contracts.js";
const wrongAgent: TurnInput = {
  id: "1",
  // @ts-expect-error invalid native backend
  agent: "generic-chat",
  sessionId: "1",
  cwd: "/tmp",
  text: "hi",
};
// @ts-expect-error missing assistant text
const wrongEvent: AgentEvent = { type: "text" };
// @ts-expect-error status must be a declared state
const wrongStatus: JobStatus = "finished-ish";
// @ts-expect-error input frames must contain text
const wrongFrame: TerminalClientMessage = { type: "input", data: 123 };
void [wrongAgent, wrongEvent, wrongStatus, wrongFrame];
