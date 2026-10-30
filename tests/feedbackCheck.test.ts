import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { buildDeliveryMessage, coachDelivery, DELIVERY_TOOL, type CreateMessage, type DeliveryInput } from "@/lib/coach";
import { FEEDBACK_BANNED_WORDS } from "@/lib/coachConfig";
import {
  bannedWords,
  missingDeliveryMessage,
  normalizeDeliveryFeedback,
  UNVERIFIED_NUMBER_NOTE,
  unverifiedNumbers,
} from "@/lib/validate";

// Delivery 3, 2, 4, 4 and face 2, 3, 4, 4 with a low-gaze stretch at 0:10–0:20.
const input: DeliveryInput = {
  total: 81,
  items: [
    { item: "말 속도", score: 3, reason: "분당 350음절 (대본 280음절, 말한 시간 0분 48초)" },
    { item: "침묵", score: 2, reason: "3초 넘게 멈춘 곳 2번" },
    { item: "목소리 크기", score: 4, reason: "끝부분 목소리 크기가 처음의 100%" },
    { item: "제한 시간", score: 4, reason: "걸린 시간 0분 58초 / 제한 시간 1분 0초" },
  ],
  silences: [
    { start: 20, end: 25 },
    { start: 40, end: 45 },
  ],
  face: {
    total: 81,
    items: [
      { item: "시선", score: 2, reason: "화면을 본 시간 45%" },
      { item: "표정", score: 3, reason: "웃는 표정 10%" },
      { item: "고개 움직임", score: 4, reason: "1초마다 고개 좌우 움직임 평균 4도" },
      { item: "화면 안 자세", score: 4, reason: "얼굴이 화면 안 알맞은 크기였던 시간 100%" },
    ],
    lowGazeWindows: [{ start: 10, end: 20 }],
  },
};
const sent = buildDeliveryMessage(input);

function item(name: string, explain = `풀이 ${name}.`, tryThis = `해 볼 것 ${name}.`) {
  return { item: name, explain, tryThis };
}

const clean = [
  item("말 속도"),
  item("침묵"),
  item("목소리 크기", "풀이 목소리 크기.", ""),
  item("제한 시간", "풀이 제한 시간.", ""),
  item("시선"),
  item("표정"),
  item("고개 움직임", "풀이 고개 움직임.", ""),
  item("화면 안 자세", "풀이 화면 안 자세.", ""),
];

function replace(items: ReturnType<typeof item>[], name: string, change: Partial<ReturnType<typeof item>>) {
  return items.map((i) => (i.item === name ? { ...i, ...change } : i));
}

function toolReply(items: unknown[], summary = "총평이에요.") {
  return {
    content: [{ type: "tool_use", id: "t1", name: DELIVERY_TOOL.name, input: { summary, items } }],
    stop_reason: "tool_use",
  } as unknown as Anthropic.Message;
}

function feedbackItem(result: Awaited<ReturnType<typeof coachDelivery>>, name: string) {
  if (!result.ok) throw new Error("expected feedback");
  return result.feedback.items.find((i) => i.item === name);
}

describe("unverifiedNumbers", () => {
  it("finds nothing when every number was in what we sent", () => {
    const text = "분당 350음절이라 3점이 나왔고, 0분 20초부터 5초 동안 멈췄어요. 화면을 본 시간은 45%예요.";
    expect(unverifiedNumbers(text, sent)).toEqual([]);
  });

  it("finds a number the coach made up", () => {
    expect(unverifiedNumbers("분당 300음절까지 줄여 보세요.", sent)).toEqual(["300"]);
  });

  it("checks a time as a whole, not as separate numbers", () => {
    // 0 and 30 do not need to appear apart; the time 0분 30초 was never sent.
    expect(unverifiedNumbers("0분 30초쯤에 쉬어 보세요.", sent)).toEqual(["0분 30초"]);
    expect(unverifiedNumbers("0분 10초~0분 20초 구간이에요.", sent)).toEqual([]);
  });

  it("accepts the seconds of a sent time said on their own", () => {
    expect(unverifiedNumbers("20초쯤 멈춘 자리예요.", sent)).toEqual([]);
  });

  it("checks a percent as a percent", () => {
    expect(unverifiedNumbers("화면을 본 시간을 70%까지 올려 보세요.", sent)).toEqual(["70%"]);
    expect(unverifiedNumbers("화면을 본 시간 45%", sent)).toEqual([]);
    // 100 was sent as a percent and as 100점 만점, but 4% never was.
    expect(unverifiedNumbers("4%만 늘려 보세요.", sent)).toEqual(["4%"]);
  });

  it("checks decimal numbers", () => {
    expect(unverifiedNumbers("1.5배로 천천히 말해 보세요.", sent)).toEqual(["1.5"]);
  });

  it("lists each made-up number once", () => {
    expect(unverifiedNumbers("300음절, 또 300음절, 그리고 60%.", sent)).toEqual(["300", "60%"]);
  });
});

describe("bannedWords", () => {
  it("finds words that judge feelings", () => {
    expect(bannedWords("긴장해서 빨라졌어요.")).toEqual(["긴장"]);
    expect(bannedWords("자신감 있게 말해 보세요.")).toEqual(["자신감"]);
    expect(bannedWords("불안해 보여요.")).toEqual(["불안"]);
  });

  it("ignores spacing inside the words", () => {
    expect(bannedWords("자신없어 보였어요.")).toEqual(["자신 없"]);
    expect(bannedWords("표정이  어두워요.")).toEqual(["표정이 어둡"]);
  });

  it("does not treat 떨어지다 (to drop) as trembling", () => {
    expect(bannedWords("시선이 화면에서 떨어진 구간이에요.")).toEqual([]);
    expect(bannedWords("목소리가 떨렸어요.").length).toBeGreaterThan(0);
    expect(bannedWords("손이 떨리는 것 같아요.").length).toBeGreaterThan(0);
  });

  it("finds nothing in plain feedback with numbers", () => {
    expect(bannedWords("화면을 본 시간이 45%라서 2점이 나왔어요.")).toEqual([]);
  });

  it("keeps the list in the config with every word the design names", () => {
    for (const word of ["긴장", "자신감", "자신 없", "불안", "표정이 어둡"]) {
      expect(FEEDBACK_BANNED_WORDS).toContain(word);
    }
  });
});

describe("screen text keeps a single tilde between times", () => {
  it("keeps 0분 10초~0분 20초 but still removes double-tilde strikethrough", () => {
    const feedback = normalizeDeliveryFeedback(
      { summary: "~~총평~~이에요.", items: [item("시선", "0분 10초~0분 20초에 낮았어요.")] },
      new Map([["시선", 2]]),
    );
    expect(feedback?.summary).toBe("총평이에요.");
    expect(feedback?.items[0].explain).toBe("0분 10초~0분 20초에 낮았어요.");
  });
});

describe("coachDelivery: number and word checks", () => {
  it("does not ask again when the feedback is clean", async () => {
    const create = vi.fn<CreateMessage>().mockResolvedValue(toolReply(clean));
    const result = await coachDelivery(input, create, "m");
    expect(create).toHaveBeenCalledTimes(1);
    expect(feedbackItem(result, "말 속도")?.unverified).toBeFalsy();
  });

  it("asks again once for a made-up number and uses the clean retry", async () => {
    const create = vi
      .fn<CreateMessage>()
      .mockResolvedValueOnce(toolReply(replace(clean, "말 속도", { tryThis: "분당 300음절로 말해 보세요." })))
      .mockResolvedValueOnce(toolReply(replace(clean, "말 속도", { tryThis: "분당 350음절보다 천천히 말해 보세요." })));
    const result = await coachDelivery(input, create, "m");
    expect(create).toHaveBeenCalledTimes(2);
    expect(feedbackItem(result, "말 속도")).toEqual({
      item: "말 속도",
      explain: "풀이 말 속도.",
      tryThis: "분당 350음절보다 천천히 말해 보세요.",
    });
  });

  it("marks an item whose made-up number is still there after asking again", async () => {
    const made = replace(clean, "시선", { explain: "화면을 본 시간이 70%면 좋아요." });
    const create = vi.fn<CreateMessage>().mockResolvedValue(toolReply(made));
    const result = await coachDelivery(input, create, "m");
    expect(create).toHaveBeenCalledTimes(2);
    expect(feedbackItem(result, "시선")?.unverified).toBe(true);
    expect(feedbackItem(result, "시선")?.explain).toBe("화면을 본 시간이 70%면 좋아요.");
    expect(feedbackItem(result, "표정")?.unverified).toBeFalsy();
  });

  it("checks the summary for made-up numbers too", async () => {
    const create = vi.fn<CreateMessage>().mockResolvedValue(toolReply(clean, "총점 90점이에요."));
    const result = await coachDelivery(input, create, "m");
    expect(create).toHaveBeenCalledTimes(2);
    expect(result.ok && result.feedback.summaryUnverified).toBe(true);
  });

  it("asks again once for a banned word and uses the clean retry", async () => {
    const create = vi
      .fn<CreateMessage>()
      .mockResolvedValueOnce(toolReply(replace(clean, "침묵", { explain: "긴장해서 멈춘 것 같아요." })))
      .mockResolvedValueOnce(toolReply(clean));
    const result = await coachDelivery(input, create, "m");
    expect(create).toHaveBeenCalledTimes(2);
    expect(feedbackItem(result, "침묵")?.explain).toBe("풀이 침묵.");
  });

  it("leaves out an item that still has a banned word after asking again", async () => {
    const create = vi
      .fn<CreateMessage>()
      .mockResolvedValue(toolReply(replace(clean, "표정", { explain: "표정이 어두워 보여요." })));
    const result = await coachDelivery(input, create, "m");
    expect(create).toHaveBeenCalledTimes(2);
    expect(feedbackItem(result, "표정")).toBeUndefined();
    expect(result.ok && result.notices).toEqual([missingDeliveryMessage(1)]);
  });

  it("leaves out a summary that still has a banned word after asking again", async () => {
    const create = vi.fn<CreateMessage>().mockResolvedValue(toolReply(clean, "자신감이 부족해 보여요."));
    const result = await coachDelivery(input, create, "m");
    expect(result.ok && result.feedback.summary).toBe("");
  });

  it("asks again only once, even with several problems", async () => {
    const messy = replace(replace(clean, "침묵", { explain: "불안해 보여요." }), "시선", { tryThis: "80%를 목표로 해 보세요." });
    const create = vi.fn<CreateMessage>().mockResolvedValue(toolReply(messy.slice(1)));
    await coachDelivery(input, create, "m");
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe("UNVERIFIED_NUMBER_NOTE", () => {
  it("tells the speaker that a number could not be checked", () => {
    expect(UNVERIFIED_NUMBER_NOTE).toBe("확인되지 않은 숫자가 있어요");
  });
});
