import { NextResponse } from "next/server";
import {
  coachModel,
  createMessageWithClient,
  ERROR_MESSAGES,
  ERROR_STATUS,
  parseReviewInput,
  reviewScript,
} from "@/lib/coach";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = parseReviewInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, kind: "bad_input", message: parsed.message }, { status: ERROR_STATUS.bad_input });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ ok: false, kind: "no_key", message: ERROR_MESSAGES.no_key }, { status: ERROR_STATUS.no_key });
  }

  const result = await reviewScript(parsed.input, createMessageWithClient(), coachModel());
  return NextResponse.json(result, { status: result.ok ? 200 : ERROR_STATUS[result.kind] });
}
