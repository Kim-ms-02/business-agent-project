import { NextResponse } from "next/server";
import {
  coachModel,
  createMessageWithClient,
  ERROR_MESSAGES,
  ERROR_STATUS,
  evaluateAnswers,
  parseAnswerInput,
} from "@/lib/coach";
import { isAnswered } from "@/lib/validate";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = parseAnswerInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, kind: "bad_input", message: parsed.message }, { status: ERROR_STATUS.bad_input });
  }

  // With every question skipped there is nothing to send, so no key is needed.
  if (parsed.input.answers.some(isAnswered) && !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ ok: false, kind: "no_key", message: ERROR_MESSAGES.no_key }, { status: ERROR_STATUS.no_key });
  }

  const result = await evaluateAnswers(parsed.input, createMessageWithClient(), coachModel());
  return NextResponse.json(result, { status: result.ok ? 200 : ERROR_STATUS[result.kind] });
}
