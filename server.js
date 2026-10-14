"use strict";

const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json({ limit: "2mb" }));

// عرض صفحات الموقع من المجلد الرئيسي
app.use(express.static(path.join(__dirname)));

// فحص حالة الخادم
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    service: "PrintoraKM",
    aiConfigured: Boolean(process.env.GROQ_API_KEY),
    model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile"
  });
});

// توليد البحث بالذكاء الاصطناعي
app.post(["/api/ai", "/api/ai/research"], async (req, res) => {
  try {
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      return res.status(503).json({
        success: false,
        error: "GROQ_API_KEY_MISSING",
        message: "أضف GROQ_API_KEY في إعدادات Render."
      });
    }

    const body = req.body || {};

    const title = String(body.title || body.topic || "").trim();
    const level = String(body.level || "متوسط").trim();
    const subject = String(body.subject || "").trim();
    const pages = String(body.pages || "5 صفحات").trim();
    const language = String(body.language || "العربية").trim();
    const pictures = String(
      body.pictures || body.images || "نعم، أريد صورًا"
    ).trim();
    const details = String(
      body.details || body.instructions || ""
    ).trim();

    if (!title) {
      return res.status(400).json({
        success: false,
        message: "أدخل عنوان البحث أولًا."
      });
    }

    const allowedLevels = [
      "ابتدائي",
      "متوسط",
      "ثانوي",
      "جامعي"
    ];

    const safeLevel = allowedLevels.includes(level) ? level : "متوسط";

    const systemPrompt = `
أنت مساعد أكاديمي يعمل لصالح منصة PrintoraKM.
اكتب بحوثًا منظمة باللغة المطلوبة، بمحتوى مناسب للمستوى الدراسي.
لا تخترع مراجع أو روابط أو أسماء مؤلفين.
إذا لم تستطع التحقق من مرجع، وضح أنه يحتاج إلى التحقق.
ميّز بين الحقائق المؤكدة والمعلومات التي تحتاج إلى مراجعة.
استخدم عنوانًا ومقدمة ومحاور رئيسية وخاتمة وقائمة مراجع.
لا تدّعِ أنك أنشأت ملف Word أو PDF أو PowerPoint؛ أعد المحتوى النصي فقط.
إذا طلب المستخدم صورًا، اقترح مواضع مناسبة للصور ووصف كل صورة ومصدرًا موثوقًا
يمكن البحث فيه، ولا تدّعِ إرفاق صور فعلية.
`;

    const userPrompt = `
أنشئ بحثًا بعنوان: ${title}

المستوى الدراسي: ${safeLevel}
المادة: ${subject || "حسب موضوع البحث"}
عدد الصفحات المطلوب تقريبًا: ${pages}
اللغة: ${language}
طلب الصور: ${pictures}
تعليمات إضافية: ${details || "لا توجد"}

رتّب الإجابة بهذا الشكل:
1. عنوان البحث.
2. صفحة غلاف مقترحة تتضمن العنوان والمستوى والمادة واسم الطالب مع ترك الاسم فارغًا.
3. فهرس مقترح.
4. مقدمة.
5. محاور البحث بالتفصيل المناسب للمستوى.
6. خاتمة.
7. المراجع والمصادر مع روابطها إن كنت واثقًا من صحتها.
8. إذا طُلبت الصور، أضف قسمًا بعنوان "الصور المقترحة" يتضمن وصف الصور ومواضعها ومصادر البحث عنها.

أعد البحث كنص منسق بعناوين واضحة.
`;

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model:
            process.env.GROQ_MODEL ||
            "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.5,
          max_tokens: 7000
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("Groq API error:", response.status, result);

      return res.status(502).json({
        success: false,
        message:
          result.error?.message ||
          "تعذر توليد البحث. تحقق من مفتاح Groq وإعداداته."
      });
    }

    const research =
      result.choices?.[0]?.message?.content?.trim();

    if (!research) {
      return res.status(502).json({
        success: false,
        message: "لم يرجع الذكاء الاصطناعي محتوى للبحث."
      });
    }

    return res.json({
      success: true,
      title,
      level: safeLevel,
      research,
      model:
        result.model ||
        process.env.GROQ_MODEL ||
        "llama-3.3-70b-versatile"
    });

  } catch (error) {
    console.error("Research generation error:", error);

    return res.status(500).json({
      success: false,
      message: "حدث خطأ في الخادم أثناء إنشاء البحث."
    });
  }
});

// معالجة الأخطاء
app.use((err, req, res, next) => {
  console.error("Server error:", err.message);

  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({
      success: false,
      message: "بيانات الطلب غير صالحة."
    });
  }

  res.status(500).json({
    success: false,
    message: "حدث خطأ داخلي في الخادم."
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`PrintoraKM server running on port ${PORT}`);
});
