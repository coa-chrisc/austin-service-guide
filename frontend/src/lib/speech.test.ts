import { describe, expect, it } from "vitest";
import {
  VOICE_WELCOME_TEXT,
  catalogSpeech,
  completionSummary,
  pickLocalVoice,
  speakable,
  splitForSpeech,
  spokenPhone,
  toBcp47,
} from "./speech";

/** Any 7+ digit run (phone-like) left in spoken text. */
function digitRuns(text: string): string[] {
  return (text.match(/\d[\d\s().-]*\d/g) ?? []).filter(
    (m) => m.replace(/\D/g, "").length >= 7,
  );
}

describe("speakable: model-written contact details never survive", () => {
  const phones = [
    "Call them at (512) 974-2000 to book.",
    "Their number is 512-974-2000.",
    "Reach the office at 512.974.2000 during business hours.",
    "You can call 5129742000 any weekday.",
    "Dial +1 512 974 2000 for help.",
    "Call 1-800-273-8255 anytime.",
    "Call 1-800-FLOWERS for help.",
    "The hotline is 974-2000.",
  ];
  it.each(phones)("drops phone: %j", (sentence) => {
    const out = speakable(`Austin Energy can help with your bill. ${sentence} They speak Spanish.`);
    expect(out).toBe("Austin Energy can help with your bill. They speak Spanish.");
    expect(digitRuns(out)).toEqual([]);
  });

  const addresses = [
    "Visit them at 1200 Barton Springs Rd.",
    "The office is at 5202 E. Ben White Blvd in Austin.",
    "Go to 1500 E 5th Street for intake.",
    "It is located at 4700 N Lamar Boulevard, Austin, TX 78756.",
    "Head to 8509 FM 969 on weekdays.",
    "Mail forms to P.O. Box 1088.",
    "They moved to 7500 Rialto Way recently.",
    "The clinic at 15 Main St serves walk-ins.",
  ];
  it.each(addresses)("drops street address: %j", (sentence) => {
    const out = speakable(`Here is one option. ${sentence} Bring a photo ID.`);
    expect(out).toBe("Here is one option. Bring a photo ID.");
    expect(out).not.toMatch(/\d/);
  });

  it("drops a ZIP or suite fragment left after an abbreviation split", () => {
    const out = speakable(
      "Visit 300 Congress Ave. Suite 200, Austin, TX 78701. They open at nine.",
    );
    expect(out).toBe("They open at nine.");
  });

  it.each([
    "Apply online at https://www.austintexas.gov/apply today.",
    "More details are at www.211texas.org.",
    "See austintexas.gov/utility-help for the form.",
    "Email help@austintexas.gov with questions.",
  ])("drops URL / email: %j", (sentence) => {
    const out = speakable(`Good news. ${sentence} I can help more.`);
    expect(out).toBe("Good news. I can help more.");
    expect(out).not.toMatch(/@|https?:|www\.|\.gov|\.org/i);
  });

  it("keeps link text but never the URL from a markdown link", () => {
    const out = speakable(
      "[Austin Public Health](https://www.austintexas.gov/aph) offers free vaccines.",
    );
    expect(out).toBe("Austin Public Health offers free vaccines.");
  });

  it("removes contact details inside bullet lists", () => {
    const out = speakable(
      "Here are two options:\n- **Meals on Wheels** — call 512-476-6325\n- **Food Bank**: 6500 Metropolis Dr\n\nWhich sounds best?",
    );
    expect(out).toBe("Here are two options: Which sounds best?");
    expect(digitRuns(out)).toEqual([]);
  });

  it("keeps short service codes like 911, 311 and 988", () => {
    expect(speakable("If you are in danger, call 911.")).toBe(
      "If you are in danger, call 911.",
    );
    expect(speakable("You can also call 3-1-1 or 988.")).toBe(
      "You can also call 3-1-1 or 988.",
    );
  });

  it("does not treat a title or initial as a sentence end", () => {
    expect(speakable("Dr. Lee at the clinic can help. Is that okay?")).toBe(
      "Dr. Lee at the clinic can help. Is that okay?",
    );
  });

  it("removes Spanish-language replies' contact details too", () => {
    const out = speakable(
      "Puede llamar al 512-974-2000. Su oficina está en 1200 Barton Springs Rd. ¿Algo más?",
    );
    expect(out).toBe("¿Algo más?");
  });

  it("returns an empty string when every sentence carries contact info", () => {
    expect(speakable("Call 512-974-2000. Visit 100 W 1st St.")).toBe("");
  });
});

describe("speakable: eligibility and income thresholds are not spoken", () => {
  it.each([
    "You may be eligible if your household earns less than $3,000 a month.",
    "Households under 200% of the federal poverty level qualify.",
    "Eligibility requires Travis County residency.",
    "Your income must be below 80 percent of AMI.",
    "Usted califica si sus ingresos son bajos.",
  ])("drops: %j", (sentence) => {
    expect(speakable(`Thanks for sharing. ${sentence} Do you rent or own?`)).toBe(
      "Thanks for sharing. Do you rent or own?",
    );
  });

  it("still speaks a question about income without figures", () => {
    expect(speakable("What is your household's monthly income?")).toBe(
      "What is your household's monthly income?",
    );
  });

  it("drops a question that states a dollar threshold", () => {
    expect(speakable("Do you earn under $2,500 a month? Okay.")).toBe("Okay.");
  });

  it("keeps ordinary small numbers", () => {
    expect(speakable("You mentioned 3 kids and 2 adults. Is that right?")).toBe(
      "You mentioned 3 kids and 2 adults. Is that right?",
    );
  });
});

describe("catalogSpeech builds contact lines from catalog records only", () => {
  const service = {
    name: "Customer Assistance Program",
    phone: "(512) 494-9400",
    locations: [
      { address: "900 Other St", city: "Austin", phone: "", is_primary: false },
      { address: "4815 Mueller Blvd", city: "Austin", phone: "", is_primary: true },
    ],
  };

  it("speaks name, digit-by-digit phone and the primary address", () => {
    expect(catalogSpeech(service)).toBe(
      "Customer Assistance Program. 5 1 2, 4 9 4, 9 4 0 0. 4815 Mueller Blvd, Austin.",
    );
  });

  it("falls back to the location phone and omits missing parts", () => {
    expect(
      catalogSpeech({
        name: "Food Pantry",
        phone: "",
        locations: [{ address: "", city: "", phone: "512-555-0100", is_primary: true }],
      }),
    ).toBe("Food Pantry. 5 1 2, 5 5 5, 0 1 0 0.");
    expect(catalogSpeech({ name: "Crisis Line", phone: "988" })).toBe(
      "Crisis Line. 9 8 8.",
    );
  });

  it("formats toll-free and extension numbers", () => {
    expect(spokenPhone("1-800-273-8255")).toBe("1, 8 0 0, 2 7 3, 8 2 5 5");
    expect(spokenPhone("512-974-2000 ext. 12")).toBe("5 1 2, 9 7 4, 2 0 0 0");
    expect(spokenPhone("")).toBe("");
  });
});

describe("completionSummary", () => {
  const matches = ["SNAP", "WIC", "Austin Energy CAP", "Meals on Wheels"].map(
    (name) => ({ service: { name } }),
  );

  it("names up to three catalog services in English", () => {
    expect(completionSummary(matches, "en")).toEqual({
      text: "Your plan is ready. I found 4 services that may help, including SNAP, WIC, and Austin Energy CAP. Select See my plan to see the details.",
      lang: "en-US",
    });
  });

  it("uses the Spanish template for Spanish sessions", () => {
    const out = completionSummary(matches.slice(0, 2), "es");
    expect(out.lang).toBe("es-US");
    expect(out.text).toBe(
      "Su plan está listo. Encontré 2 servicios que pueden ayudarle, incluidos SNAP y WIC. Seleccione See my plan para ver los detalles.",
    );
  });

  it("handles no matches and a single match", () => {
    expect(completionSummary([], "en").text).toMatch(/intake is complete/);
    expect(completionSummary(matches.slice(0, 1), "en").text).toBe(
      "Your plan is ready. I found 1 service that may help: SNAP. Select See my plan to see the details.",
    );
  });

  it("falls back to English for other languages", () => {
    expect(completionSummary(matches, "vi").lang).toBe("en-US");
  });
});

describe("language and voice helpers", () => {
  it("maps app language codes to BCP-47", () => {
    expect(toBcp47("en")).toBe("en-US");
    expect(toBcp47("es")).toBe("es-US");
    expect(toBcp47("ko")).toBe("ko-KR");
    expect(toBcp47("es_mx")).toBe("es-MX");
    expect(toBcp47("pt")).toBe("pt");
    expect(toBcp47("")).toBe("en-US");
  });

  it("picks only on-device voices", () => {
    const voices = [
      { name: "Cloud US", lang: "en-US", localService: false, default: true },
      { name: "Local GB", lang: "en-GB", localService: true },
      { name: "Local US", lang: "en_US", localService: true },
      { name: "Cloud ES", lang: "es-US", localService: false },
    ];
    expect(pickLocalVoice(voices, "en-US")?.name).toBe("Local US");
    expect(pickLocalVoice(voices, "en-AU")?.name).toBe("Local GB");
    expect(pickLocalVoice(voices, "es-US")).toBeNull();
    expect(pickLocalVoice([], "en-US")).toBeNull();
  });

  it("splits long text into speakable chunks", () => {
    const long = `${"word ".repeat(80).trim()}. Short one.`;
    const chunks = splitForSpeech(long, 100);
    expect(chunks.every((c) => c.length <= 100)).toBe(true);
    expect(chunks.join(" ")).toBe(long);
  });

  it("keeps the exact welcome text", () => {
    expect(VOICE_WELCOME_TEXT).toBe(
      "Welcome to the Service Guide Voice Assistant. To protect your privacy, please do not say your name, street address, phone number, or Social Security number. Simply tell me what kind of help or services you are looking for today.",
    );
  });
});

describe("speakable: figures and addresses without obvious markers", () => {
  it.each([
    "SNAP can help if your household makes less than 2,500 a month.",
    "Usted puede recibir ayuda si gana menos de 2,500 al mes.",
    "The limit is two thousand five hundred a month for a family of three.",
    "Their office is at 1200 barton springs road.",
    "Visit them at twelve hundred Barton Springs Road.",
    "Households under 900 a month may get help.",
  ])("drops %s", (sentence) => {
    expect(speakable(`Here is what I found. ${sentence}`)).toBe("Here is what I found.");
  });

  it.each([
    "I found 13 services that may help.",
    "One long road can feel hard, and I'm here to help.",
    "What is your household's total monthly income?",
  ])("keeps %s", (sentence) => {
    expect(speakable(sentence)).toBe(sentence);
  });
});
