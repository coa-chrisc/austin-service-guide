/* ------------------------------------------------------------------ */
/*  UI strings for the realtime voice panel, welcome and consent.      */
/*  Same approach as resultsI18n.ts: one dictionary per UI language,   */
/*  English fallback. English is canonical; the other languages are   */
/*  machine-written and should be reviewed with the rest of the UI.    */
/* ------------------------------------------------------------------ */

const EN = {
  voice_title: "Voice assistant",
  privacy_reminder:
    "Please don't say your name, street address, phone number, or Social Security number.",
  any_language_hint:
    "Speak in your own language. The guide will switch automatically.",
  consent_title: "Your voice will be sent to OpenAI",
  consent_body:
    "In this voice mode, the audio from your microphone is streamed directly to OpenAI's Realtime API, which listens and answers out loud. This mode is intended for deployments that have a zero-data-retention agreement with OpenAI.",
  consent_privacy:
    "Please do not say your name, street address, phone number, or Social Security number. If you'd rather not send audio, choose Cancel and type your messages instead.",
  consent_cancel: "Cancel",
  consent_agree: "I agree, start voice",
};

export type VoiceStringKey = keyof typeof EN;

export const VOICE_I18N: Record<string, Record<VoiceStringKey, string>> = {
  en: EN,
  es: {
    voice_title: "Asistente de voz",
    privacy_reminder:
      "Por favor, no diga su nombre, dirección, número de teléfono ni número de Seguro Social.",
    any_language_hint:
      "Hable en su propio idioma. La guía cambiará de idioma automáticamente.",
    consent_title: "Su voz se enviará a OpenAI",
    consent_body:
      "En este modo de voz, el audio de su micrófono se transmite directamente a la API Realtime de OpenAI, que escucha y responde en voz alta. Este modo está pensado para instalaciones que tienen un acuerdo de retención cero de datos con OpenAI.",
    consent_privacy:
      "Por favor, no diga su nombre, dirección, número de teléfono ni número de Seguro Social. Si prefiere no enviar audio, elija Cancelar y escriba sus mensajes.",
    consent_cancel: "Cancelar",
    consent_agree: "Acepto, iniciar voz",
  },
  zh: {
    voice_title: "语音助手",
    privacy_reminder: "请不要说出您的姓名、街道地址、电话号码或社会安全号码。",
    any_language_hint: "请用您自己的语言说话，向导会自动切换语言。",
    consent_title: "您的语音将发送给 OpenAI",
    consent_body:
      "在此语音模式下，您麦克风的音频会直接传送到 OpenAI 的 Realtime API，由它聆听并语音回答。此模式适用于与 OpenAI 签有零数据保留协议的部署。",
    consent_privacy:
      "请不要说出您的姓名、街道地址、电话号码或社会安全号码。如果您不想发送音频，请选择“取消”，改为输入文字。",
    consent_cancel: "取消",
    consent_agree: "我同意，开始语音",
  },
  hi: {
    voice_title: "आवाज़ सहायक",
    privacy_reminder:
      "कृपया अपना नाम, घर का पता, फ़ोन नंबर या सोशल सिक्योरिटी नंबर न बताएँ।",
    any_language_hint:
      "अपनी भाषा में बोलें। गाइड अपने आप आपकी भाषा में बदल जाएगा।",
    consent_title: "आपकी आवाज़ OpenAI को भेजी जाएगी",
    consent_body:
      "इस वॉइस मोड में आपके माइक्रोफ़ोन का ऑडियो सीधे OpenAI के Realtime API को भेजा जाता है, जो सुनता है और बोलकर जवाब देता है। यह मोड उन इंस्टॉलेशन के लिए है जिनका OpenAI के साथ शून्य डेटा प्रतिधारण (zero data retention) समझौता है।",
    consent_privacy:
      "कृपया अपना नाम, घर का पता, फ़ोन नंबर या सोशल सिक्योरिटी नंबर न बताएँ। अगर आप ऑडियो नहीं भेजना चाहते, तो रद्द करें चुनें और अपने संदेश टाइप करें।",
    consent_cancel: "रद्द करें",
    consent_agree: "मैं सहमत हूँ, आवाज़ शुरू करें",
  },
  ar: {
    voice_title: "المساعد الصوتي",
    privacy_reminder:
      "يُرجى عدم ذكر اسمك أو عنوان سكنك أو رقم هاتفك أو رقم الضمان الاجتماعي.",
    any_language_hint: "تحدّث بلغتك. سيتحوّل المرشد إليها تلقائيًا.",
    consent_title: "سيتم إرسال صوتك إلى OpenAI",
    consent_body:
      "في وضع الصوت هذا، يُبث صوت الميكروفون مباشرةً إلى واجهة Realtime API من OpenAI، التي تستمع وتجيب بصوت مسموع. هذا الوضع مخصص لعمليات النشر التي لديها اتفاقية عدم الاحتفاظ بالبيانات مع OpenAI.",
    consent_privacy:
      "يُرجى عدم ذكر اسمك أو عنوان سكنك أو رقم هاتفك أو رقم الضمان الاجتماعي. إذا كنت تفضّل عدم إرسال الصوت، فاختر إلغاء واكتب رسائلك بدلًا من ذلك.",
    consent_cancel: "إلغاء",
    consent_agree: "أوافق، ابدأ المحادثة الصوتية",
  },
  vi: {
    voice_title: "Trợ lý giọng nói",
    privacy_reminder:
      "Vui lòng không nói tên, địa chỉ nhà, số điện thoại hoặc số An sinh Xã hội của quý vị.",
    any_language_hint:
      "Hãy nói bằng ngôn ngữ của quý vị. Hướng dẫn viên sẽ tự động chuyển ngôn ngữ.",
    consent_title: "Giọng nói của quý vị sẽ được gửi đến OpenAI",
    consent_body:
      "Ở chế độ giọng nói này, âm thanh từ micrô của quý vị được truyền trực tiếp đến Realtime API của OpenAI, nơi lắng nghe và trả lời thành tiếng. Chế độ này dành cho các hệ thống đã có thỏa thuận không lưu giữ dữ liệu với OpenAI.",
    consent_privacy:
      "Vui lòng không nói tên, địa chỉ nhà, số điện thoại hoặc số An sinh Xã hội của quý vị. Nếu không muốn gửi âm thanh, hãy chọn Hủy và nhập tin nhắn thay vào đó.",
    consent_cancel: "Hủy",
    consent_agree: "Tôi đồng ý, bắt đầu nói",
  },
  fr: {
    voice_title: "Assistant vocal",
    privacy_reminder:
      "Merci de ne pas dire votre nom, votre adresse, votre numéro de téléphone ni votre numéro de sécurité sociale.",
    any_language_hint:
      "Parlez dans votre propre langue. Le guide changera de langue automatiquement.",
    consent_title: "Votre voix sera envoyée à OpenAI",
    consent_body:
      "Dans ce mode vocal, le son de votre micro est transmis directement à l'API Realtime d'OpenAI, qui écoute et répond à voix haute. Ce mode est prévu pour les déploiements qui ont un accord de non-conservation des données avec OpenAI.",
    consent_privacy:
      "Merci de ne pas dire votre nom, votre adresse, votre numéro de téléphone ni votre numéro de sécurité sociale. Si vous préférez ne pas envoyer d'audio, choisissez Annuler et tapez vos messages.",
    consent_cancel: "Annuler",
    consent_agree: "J'accepte, démarrer la voix",
  },
  ko: {
    voice_title: "음성 도우미",
    privacy_reminder: "이름, 집 주소, 전화번호, 사회보장번호는 말하지 마세요.",
    any_language_hint: "편한 언어로 말씀하세요. 가이드가 자동으로 언어를 바꿉니다.",
    consent_title: "음성이 OpenAI로 전송됩니다",
    consent_body:
      "이 음성 모드에서는 마이크 오디오가 OpenAI의 Realtime API로 바로 전송되며, API가 듣고 소리 내어 답합니다. 이 모드는 OpenAI와 데이터 무보존 계약을 맺은 배포 환경용입니다.",
    consent_privacy:
      "이름, 집 주소, 전화번호, 사회보장번호는 말하지 마세요. 오디오를 보내고 싶지 않으면 취소를 선택하고 메시지를 입력하세요.",
    consent_cancel: "취소",
    consent_agree: "동의하고 음성 시작",
  },
};

export type VoiceT = (key: VoiceStringKey) => string;

/** Translator for a UI language code ("es", "es-US"); English fallback. */
export function makeVoiceT(lang: string | null | undefined): VoiceT {
  const base = (lang || "en").trim().toLowerCase().replace(/_/g, "-").split("-")[0];
  const dict = VOICE_I18N[base] ?? EN;
  return (key) => dict[key] || EN[key];
}
