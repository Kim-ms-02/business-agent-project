import { NextResponse } from "next/server";
import { coachModel, createMessageWithClient, ERROR_MESSAGES, parseReviewInput, reviewScript } from "@/lib/coach";

const STATUS = { no_key: 500, auth: 502, network: 502, busy: 503, invalid_response: 502, refused: 422, unknown: 500 };

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = parseReviewInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, kind: "bad_input", message: parsed.message }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ ok: false, kind: "no_key", message: ERROR_MESSAGES.no_key }, { status: STATUS.no_key });
  }

  const result = await reviewScript(parsed.input, createMessageWithClient(), coachModel());
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS[result.kind] });
}
