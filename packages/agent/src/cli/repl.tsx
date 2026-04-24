import React, { useState, useCallback } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import type { AgentRunner } from "../agent/runner.js";
import type { SlashRegistry } from "../skills/commands.js";
import type { CreativePipeline } from "@livepeer/creative-kit";

export interface ReplProps {
  runner: AgentRunner;
  slash: SlashRegistry;
  pipeline?: CreativePipeline;
}

interface Line {
  kind: "user" | "agent" | "system";
  text: string;
}

export const Repl: React.FC<ReplProps> = ({ runner, slash, pipeline }) => {
  const [input, setInput] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(
    async (line: string) => {
      if (!line.trim() || busy) return;
      setLines((l) => [...l, { kind: "user", text: line }]);
      setInput("");
      setBusy(true);

      const slashRes = await slash.run(line);
      if (slashRes) {
        setLines((l) => [...l, { kind: "system", text: slashRes.output }]);
      } else {
        // Creative Pipeline: classify → validate → execute
        // If handled, skip the agent. If not, fall through to agent.
        let pipelineHandled = false;
        if (pipeline) {
          try {
            const result = await pipeline.run(line);
            if (result.handled) {
              pipelineHandled = true;
              setLines((l) => [...l, { kind: "system", text: result.summary }]);
            }
          } catch (e) {
            // Pipeline error — fall through to agent
            setLines((l) => [...l, { kind: "system", text: `Pipeline: ${(e as Error).message}` }]);
          }
        }

        if (!pipelineHandled) {
          try {
            const result = await runner.run({ user: line });
            setLines((l) => [
              ...l,
              { kind: "agent", text: result.finalText || "(no response)" },
            ]);
          } catch (e) {
            setLines((l) => [
              ...l,
              { kind: "system", text: `Error: ${(e as Error).message}` },
            ]);
          }
        }
      }
      setBusy(false);
    },
    [busy, runner, slash, pipeline],
  );

  return (
    <Box flexDirection="column">
      {lines.map((l, i) => (
        <Text
          key={i}
          color={
            l.kind === "user"
              ? "white"
              : l.kind === "agent"
                ? "cyan"
                : "yellow"
          }
        >
          {l.kind === "user" ? "› " : l.kind === "agent" ? "✦ " : "⚙ "}
          {l.text}
        </Text>
      ))}
      {!busy && (
        <Box>
          <Text>{"› "}</Text>
          <TextInput value={input} onChange={setInput} onSubmit={submit} />
        </Box>
      )}
    </Box>
  );
};
