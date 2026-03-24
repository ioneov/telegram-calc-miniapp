export default {
  async fetch(request, env, ctx) {
    if (request.method === "POST") {
      try {
        const update = await request.json();
        
        if (update.message) {
          const chatId = update.message.chat.id;
          const text = (update.message.text || "").trim();

          if (text === "/start") {
            await sendMessage(env.BOT_TOKEN, {
              chat_id: chatId,
              text: "Открой по кнопке ниже 👇",
              reply_markup: {
                inline_keyboard: [
                  [{ text: "Открыть приложение", web_app: { url: env.MINI_APP_URL } }]
                ]
              }
            });
          } else if (text === "/help") {
            await sendMessage(env.BOT_TOKEN, {
              chat_id: chatId,
              text:
                "Бот открывает калькуляторы.\n\n" +
                "Доступные команды:\n" +
                "/start - запуск бота\n" +
                "/help - показать справку\n\n" +
                "Что доступно:\n" +
                "- расчет суточной нормы калорий\n" +
                "- расчет БЖУ по целям\n" +
                "- беговые расчеты: темп, скорость, целевой темп, конвертер",
              reply_markup: {
                inline_keyboard: [
                  [{ text: "Открыть приложение", web_app: { url: env.MINI_APP_URL } }]
                ]
              }
            });
          } else {
            // Если ввели что-то другое, предлагаем только /start или /help
            await sendMessage(env.BOT_TOKEN, {
              chat_id: chatId,
              text: "Используй /start или /help"
            });
          }
        }
      } catch (error) {
        console.error("Ошибка при обработке запроса:", error);
      }
    }

    return new Response("OK", { status: 200 });
  }
};

async function sendMessage(botToken, body) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}