export type InterpretationKind = "REQUEST" | "EVENT";
export type InterpretationMode = "DEMO_FALLBACK" | "UNMATCHED";

type RequestField =
  | "service"
  | "quantity"
  | "date"
  | "window"
  | "location";

type EventField = "eventType" | "technicianId" | "date";

export interface RequestInterpretation {
  readonly kind: "REQUEST";
  readonly mode: InterpretationMode;
  readonly originalText: string;
  readonly service?: "INSTALLATION";
  readonly quantity?: number;
  readonly date?: string;
  readonly window?: readonly [string, string];
  readonly location?: string;
  readonly durationMinutes?: number;
  readonly technicians?: number;
  readonly confidence: Readonly<Record<string, number>>;
  readonly missingFields: readonly RequestField[];
}

export interface EventInterpretation {
  readonly kind: "EVENT";
  readonly mode: InterpretationMode;
  readonly originalText: string;
  readonly eventType?: "TECHNICIAN_UNAVAILABLE";
  readonly technicianId?: "TECH-CARLOS";
  readonly date?: string;
  readonly interval?: readonly [string, string];
  readonly allDay?: boolean;
  readonly confidence: Readonly<Record<string, number>>;
  readonly missingFields: readonly EventField[];
}

export type Interpretation = RequestInterpretation | EventInterpretation;

const normalize = (text: string): string =>
  text
    .normalize("NFC")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/[.!?]+$/u, "")
    .replace(/\s+/gu, " ");

const REQUEST_PHRASE =
  "preciso instalar dois aparelhos amanhã à tarde na vila mariana";
const EVENT_PHRASE = "carlos não poderá trabalhar amanhã";

export function interpretInput(
  text: string,
  kind: "REQUEST",
): RequestInterpretation;
export function interpretInput(text: string, kind: "EVENT"): EventInterpretation;
export function interpretInput(
  text: string,
  kind: InterpretationKind,
): Interpretation;
export function interpretInput(
  text: string,
  kind: InterpretationKind,
): Interpretation {
  const normalized = normalize(text);

  if (kind === "REQUEST") {
    if (normalized === REQUEST_PHRASE) {
      return {
        kind,
        mode: "DEMO_FALLBACK",
        originalText: text,
        service: "INSTALLATION",
        quantity: 2,
        date: "2026-08-20",
        window: ["13:00", "18:00"],
        location: "Vila Mariana",
        durationMinutes: 120,
        technicians: 2,
        confidence: {
          service: 1,
          quantity: 1,
          date: 1,
          window: 1,
          location: 1,
          durationMinutes: 1,
          technicians: 1,
        },
        missingFields: [],
      };
    }

    return {
      kind,
      mode: "UNMATCHED",
      originalText: text,
      confidence: {},
      missingFields: ["service", "quantity", "date", "window", "location"],
    };
  }

  if (normalized === EVENT_PHRASE) {
    return {
      kind,
      mode: "DEMO_FALLBACK",
      originalText: text,
      eventType: "TECHNICIAN_UNAVAILABLE",
      technicianId: "TECH-CARLOS",
      date: "2026-08-20",
      interval: ["07:00", "19:00"],
      allDay: true,
      confidence: {
        eventType: 1,
        technicianId: 1,
        date: 1,
        interval: 1,
        allDay: 1,
      },
      missingFields: [],
    };
  }

  return {
    kind,
    mode: "UNMATCHED",
    originalText: text,
    confidence: {},
    missingFields: ["eventType", "technicianId", "date"],
  };
}

export const deterministicInterpreter = {
  interpretServiceRequest(text: string): RequestInterpretation {
    return interpretInput(text, "REQUEST");
  },
  interpretOperationalEvent(text: string): EventInterpretation {
    return interpretInput(text, "EVENT");
  },
};
