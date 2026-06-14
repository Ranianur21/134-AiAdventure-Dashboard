exports.handler = async (event) => {

  try {

    const { prompt } = JSON.parse(event.body);

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [
            {
              role: "system",
              content:
                "Kamu adalah analis bisnis senior yang memberi insight singkat, praktis, dan langsung ke poin. Gunakan Bahasa Indonesia."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          max_tokens: 600,
          temperature: 0.3
        })
      }
    );

    const data = await response.json();

    return {
      statusCode: 200,
      body: JSON.stringify(data)
    };

  } catch (err) {

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message
      })
    };

  }

};