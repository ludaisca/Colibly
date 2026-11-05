import { describe, expect, it } from "vitest";
import { buildFunnel, coreProgress, nextNudge, stuckAt, type ActivationStamps, type NudgeInput } from "../rules";

const H = 3_600_000;
const D = 24 * H;
const T0 = new Date("2026-11-01T12:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

const none: ActivationStamps = {
  emailVerifiedAt: null,
  channelAt: null,
  firstInboundAt: null,
  firstReplyAt: null,
  automationAt: null,
  teamAt: null,
  paidAt: null,
};

function input(over: Omit<Partial<NudgeInput>, "stamps"> & { stamps?: Partial<ActivationStamps> } = {}): NudgeInput {
  const { stamps, ...rest } = over;
  return {
    now: at(2 * D),
    createdAt: T0,
    status: "TRIALING",
    isInternal: false,
    ownerVerified: true,
    optOut: false,
    trialDaysLeft: 12,
    billingReminderDays: [7, 3, 1],
    sent: [],
    lastNudgeAt: null,
    ...rest,
    stamps: { ...none, emailVerifiedAt: T0, ...stamps },
  };
}

describe("stuckAt / coreProgress", () => {
  it("devuelve el primer paso que falta", () => {
    expect(stuckAt(none)).toBe("emailVerified");
    expect(stuckAt({ ...none, emailVerifiedAt: T0 })).toBe("channel");
    expect(stuckAt({ ...none, emailVerifiedAt: T0, channelAt: T0, firstInboundAt: T0 })).toBe("firstReply");
  });

  it("null cuando completó todo", () => {
    const all = Object.fromEntries(Object.keys(none).map((k) => [k, T0])) as unknown as ActivationStamps;
    expect(stuckAt(all)).toBeNull();
    expect(coreProgress(all)).toBe(5);
  });

  it("coreProgress no cuenta equipo ni pago", () => {
    expect(coreProgress({ ...none, teamAt: T0, paidAt: T0 })).toBe(0);
  });
});

describe("buildFunnel", () => {
  it("cuenta cada paso, porcentajes y mediana de horas", () => {
    const rows = [
      { createdAt: T0, stamps: { ...none, emailVerifiedAt: at(1 * H), channelAt: at(2 * H) } },
      { createdAt: T0, stamps: { ...none, emailVerifiedAt: at(3 * H), channelAt: at(10 * H), firstInboundAt: at(11 * H) } },
      { createdAt: T0, stamps: { ...none, emailVerifiedAt: at(5 * H) } },
      { createdAt: T0, stamps: none },
    ];
    const f = buildFunnel(rows);
    const by = Object.fromEntries(f.map((r) => [r.step, r]));
    expect(by.signup).toMatchObject({ count: 4, pctOfSignups: 100, medianHours: 0 });
    expect(by.emailVerified).toMatchObject({ count: 3, pctOfSignups: 75, pctOfPrevious: 75, medianHours: 3 });
    expect(by.channel).toMatchObject({ count: 2, pctOfSignups: 50, pctOfPrevious: 67, medianHours: 6 });
    expect(by.firstInbound).toMatchObject({ count: 1, pctOfPrevious: 50, medianHours: 11 });
    expect(by.paid).toMatchObject({ count: 0, pctOfSignups: 0, medianHours: null });
  });

  it("una cohorte vacía no divide entre cero", () => {
    expect(buildFunnel([]).every((r) => r.count === 0 && r.pctOfSignups === 0)).toBe(true);
  });

  it("un sello anterior al registro cuenta como 0 h", () => {
    const f = buildFunnel([{ createdAt: T0, stamps: { ...none, emailVerifiedAt: at(-H) } }]);
    expect(f[1].medianHours).toBe(0);
  });
});

describe("nextNudge", () => {
  it("sin canal tras 24 h: consejo de canal", () => {
    expect(nextNudge(input({ now: at(23 * H) }))).toBeNull();
    expect(nextNudge(input({ now: at(25 * H) }))).toBe("channel");
  });

  it("sin canal y ya avisado: nada más (no salta pasos)", () => {
    expect(nextNudge(input({ now: at(6 * D), sent: ["channel"] }))).toBeNull();
  });

  it("canal sin mensajes 24 h después de conectarlo", () => {
    expect(nextNudge(input({ now: at(30 * H), stamps: { channelAt: at(10 * H) } }))).toBeNull();
    expect(nextNudge(input({ now: at(35 * H), stamps: { channelAt: at(10 * H) } }))).toBe("first_message");
  });

  it("bot desde el día 3, equipo desde el día 5 y con una respuesta", () => {
    const base = { channelAt: T0, firstInboundAt: T0 };
    expect(nextNudge(input({ now: at(2.5 * D), stamps: base }))).toBeNull();
    expect(nextNudge(input({ now: at(3 * D), stamps: base }))).toBe("automation");
    expect(nextNudge(input({ now: at(6 * D), stamps: { ...base, automationAt: T0 } }))).toBeNull();
    expect(nextNudge(input({ now: at(6 * D), stamps: { ...base, automationAt: T0, firstReplyAt: T0 } }))).toBe("team");
    expect(nextNudge(input({ now: at(6 * D), stamps: { ...base, firstReplyAt: T0 }, sent: ["automation"] }))).toBe("team");
  });

  it("respeta 48 h entre consejos", () => {
    const stamps = { channelAt: T0, firstInboundAt: T0 };
    expect(nextNudge(input({ now: at(4 * D), stamps, lastNudgeAt: at(3 * D) }))).toBeNull();
    expect(nextNudge(input({ now: at(5 * D), stamps, lastNudgeAt: at(3 * D) }))).toBe("automation");
  });

  it("no manda fuera de prueba, a internas, sin correo confirmado o con baja", () => {
    const n = { now: at(2 * D) };
    expect(nextNudge(input({ ...n, status: "ACTIVE" }))).toBeNull();
    expect(nextNudge(input({ ...n, isInternal: true }))).toBeNull();
    expect(nextNudge(input({ ...n, ownerVerified: false }))).toBeNull();
    expect(nextNudge(input({ ...n, optOut: true }))).toBeNull();
  });

  it("no choca con el recordatorio de fin de prueba ni manda con la prueba vencida", () => {
    expect(nextNudge(input({ trialDaysLeft: 7 }))).toBeNull();
    expect(nextNudge(input({ trialDaysLeft: 0 }))).toBeNull();
    expect(nextNudge(input({ trialDaysLeft: 6 }))).toBe("channel");
  });
});
