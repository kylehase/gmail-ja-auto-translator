// ==========================================
// CONFIGURATION
// ==========================================
// Get your free Gemini API key from: https://aistudio.google.com/
const GEMINI_API_KEY = 'YOUR API KEY'; 

const SOURCE_LABEL = 'JA';

function processJapaneseEmails() {
  // Get the current user's email address to send the summary to
  const myEmail = Session.getActiveUser().getEmail();
  
  // Get the original source label object so we can remove it later
  const sourceLabelObj = GmailApp.getUserLabelByName(SOURCE_LABEL);
  
  // Find up to 10 recent threads with 'JA' label that haven't been translated
  const threads = GmailApp.search(`label:${SOURCE_LABEL}`, 0, 10);
  
  for (const thread of threads) {
    const messages = thread.getMessages();
    const lastMessage = messages[messages.length - 1]; // Grab the latest message in the thread
    
    const originalSender = lastMessage.getFrom();
    const originalSubject = lastMessage.getSubject();
    const originalBody = lastMessage.getBody(); // Get HTML body to preserve rich text
    
    // Translate Sender and Subject using standard Google Translate API
    const translatedSender = LanguageApp.translate(originalSender, 'ja', 'en');
    const translatedSubject = LanguageApp.translate(originalSubject, 'ja', 'en');
    
    // Translate Body using Gemini API for nuance
    const translatedBody = translateWithGemini(originalBody);
    
    // Manually construct the modern Gmail URL using the raw thread ID
    // This drops you directly into the interactive UI, not the legacy print view
    const threadLink = `https://mail.google.com/mail/u/0/#all/${thread.getId()}`;
    
    // Clean up the sender name (removes the raw email address in brackets if present for a cleaner subject line)
    const cleanSender = translatedSender.replace(/<.*>/, '').trim(); 
    const newSubject = `${cleanSender}: ${translatedSubject}`;
    
    const finalHtmlBody = `
      <div style="font-family: Arial, sans-serif; padding: 15px; background-color: #f1f3f4; border-radius: 8px; margin-bottom: 20px;">
        <h3 style="margin-top: 0; color: #202124;">Original Email Details</h3>
        <strong>From:</strong> ${originalSender}<br>
        <strong>Subject:</strong> ${originalSubject}<br><br>
        <a href="${threadLink}" style="background-color: #1a73e8; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px; display: inline-block;">
          View / Reply to Original Thread
        </a>
      </div>
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #202124;">
${translatedBody}
      </div>
    `;
    
    // Send the compiled email back to yourself
    MailApp.sendEmail({
      to: myEmail,
      subject: newSubject,
      htmlBody: finalHtmlBody
    });

    
    // Remove the original "JA" label to keep the inbox clean
    if (sourceLabelObj) {
      thread.removeLabel(sourceLabelObj);
    }
  }
}

function translateWithGemini(text) {
  if (!text || text.trim() === '') return '(Empty Body)';
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
  
  const prompt = `You are an expert translator specializing in Japanese business communications. 
  Translate the following Japanese email body to English. 

  CRITICAL INSTRUCTIONS:
  1. The input is an HTML email. You MUST preserve all HTML tags, inline CSS styles, formatting (bold, italics), and links exactly as they appear in the original. Translate ONLY the text content.
  2. Strip away common, repetitive Japanese business formalities (e.g., "Osewa ni natte orimasu", "Yoroshiku onegai itashimasu", standard seasonal greetings) that do not add substantive meaning.
  3. Decode indirect cultural nuances. If the sender uses soft language to imply a hard truth (e.g., "chotto muzukashii" / "it is a little difficult"), translate it to reflect the actual business reality (e.g., "we cannot do this" or "it is not possible"). Prioritize clarity over literal translation.
  4. Return ONLY the translated HTML. Do not include any introductory filler, conversational text, or markdown formatting blocks (e.g., DO NOT wrap the output in \`\`\`html ... \`\`\`).

  Japanese Email Body (HTML):
  ${text}`;
  
  const payload = {
    "contents": [{"parts": [{"text": prompt}]}],
    "generationConfig": {
      "temperature": 0.1 // Low temperature for more factual, less "creative" output
    }
  };
  
  const options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const json = JSON.parse(response.getContentText());
    
    if (json.error) {
      Logger.log('Gemini API Error: ' + json.error.message);
      return `[Translation Error: ${json.error.message}]`;
    }
    
    return json.candidates[0].content.parts[0].text;
  } catch (e) {
    return `[Script Error during translation: ${e.toString()}]`;
  }
}
