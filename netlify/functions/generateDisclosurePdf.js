// netlify/functions/generateDisclosurePdf.js
//
// Generates the unsigned Client Technology & AI Use Disclosure PDF.
// Faithful to the original document's actual legal text, with the
// agent/client/brokerage fields populated from the Supabase record.

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://petfaclkzdudyvyhifaj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_H6IVVyBLqTTsub1zH_igSw_EqimRQ9Y';

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const { disclosureId } = payload;
  if (!disclosureId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'disclosureId is required' }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  try {
    const { data: d, error: fetchError } = await supabase
      .rpc('get_disclosure', { p_id: disclosureId })
      .single();

    if (fetchError || !d) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Disclosure not found' }) };
    }

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontSize = 9;
    const fontSizeHeading = 12;
    const fontSizeTitle = 14;
    const textColor = rgb(0.1, 0.1, 0.1);
    const mutedColor = rgb(0.4, 0.4, 0.4);

    const margin = 50;
    const bottomMargin = 40;
    const contentWidth = 512;
    let page = pdfDoc.addPage([612, 792]);
    let y = 740;

    // Page-aware line drawing, checked before every line -- the fix
    // learned earlier today, so long sections never run text off the
    // bottom of a page.
    const drawLine = (text, x, size, fontFace, color) => {
      if (y < bottomMargin + size) {
        page = pdfDoc.addPage([612, 792]);
        y = 740;
      }
      page.drawText(text, { x, y, size, font: fontFace, color });
      y -= size + 4;
    };

    const drawWrappedLine = (text, x, maxWidth, size, fontFace, color) => {
      const words = String(text).split(' ');
      let line = '';
      for (const word of words) {
        const testLine = line ? line + ' ' + word : word;
        const w = fontFace.widthOfTextAtSize(testLine, size);
        if (w > maxWidth && line) {
          drawLine(line, x, size, fontFace, color);
          line = word;
        } else {
          line = testLine;
        }
      }
      if (line) drawLine(line, x, size, fontFace, color);
    };

    const sectionHeading = (text) => {
      y -= 6;
      drawLine(text, margin, fontSizeHeading, fontBold, textColor);
      y -= 2;
    };

    const agentDisplayName = d.agent_name || d.agent_email;
    const brokerageName = d.brokerage_name || 'Attorney Broker Services, LLC';

    // ── Header ──
    drawLine('Attorney Broker Services, LLC', margin, fontSize, fontBold, textColor);
    drawLine('Brokerage License #9007529', margin, 8, font, mutedColor);
    y -= 4;
    drawLine('CLIENT TECHNOLOGY & AI USE DISCLOSURE', margin, fontSizeTitle, fontBold, textColor);
    drawLine(`Attorney Broker Services, LLC · Brokerage License #9007529`, margin, 8, font, mutedColor);
    drawLine('Effective June 1, 2026', margin, 8, font, mutedColor);
    y -= 8;

    drawWrappedLine('This disclosure is provided to inform you about the technology and artificial intelligence (AI) tools used by Attorney Broker Services, LLC and its affiliated license holders in connection with your real estate transaction. Please read this disclosure carefully and acknowledge receipt at the bottom of this page.', margin, contentWidth, fontSize, font, textColor);
    y -= 6;

    sectionHeading('1. Use of Artificial Intelligence Tools');
    drawWrappedLine('Texas AI Notice (TRAIGA): You are interacting with a brokerage that uses Artificial Intelligence (AI) systems. In compliance with the Texas Responsible Artificial Intelligence Governance Act (TRAIGA), Attorney Broker Services discloses that AI tools may be used in connection with your transaction. These systems are not sentient, do not provide legal advice, and may produce errors. All AI-generated content is reviewed and approved by a licensed real estate professional before delivery to you.', margin, contentWidth, fontSize, font, textColor);
    y -= 4;
    drawWrappedLine('What AI May Be Used For: AI tools may be used to assist in preparing: listing descriptions and marketing materials; client communications and email drafts; market analysis and comparable property data; offer strategy and negotiation guidance; transaction document preparation and review assistance; and showing agreement workflows.', margin, contentWidth, fontSize, font, textColor);
    y -= 4;
    drawWrappedLine('What AI Is NOT Used For: AI does not make final decisions on your behalf. Your licensed agent exercises independent professional judgment on all material matters. AI-generated content is supplemental to — not a substitute for — your agent\'s professional expertise.', margin, contentWidth, fontSize, font, textColor);

    sectionHeading('2. Human Oversight Requirement');
    drawWrappedLine('Agent Review: All AI-generated content delivered to you has been personally reviewed, verified, and approved by your licensed agent before delivery. Your agent is responsible for the accuracy of all materials provided to you regardless of how they were prepared.', margin, contentWidth, fontSize, font, textColor);
    y -= 4;
    drawWrappedLine('Your Responsibility: You are encouraged to independently verify all material facts, market data, property information, and financial estimates provided in connection with your transaction regardless of how they were prepared.', margin, contentWidth, fontSize, font, textColor);

    sectionHeading('3. Data Privacy & Security');
    drawWrappedLine('Your Data: Personal information you provide — including your name, contact information, financial details, and transaction information — is used solely for the purpose of facilitating your real estate transaction. We do not sell your personal information to third parties.', margin, contentWidth, fontSize, font, textColor);
    y -= 4;
    drawWrappedLine('AI Tool Data Handling: When AI tools are used, your data is processed through secure platforms. Attorney Broker Services does not knowingly submit your personally identifiable information to public AI training models. Our agents are required to comply with our data handling policies.', margin, contentWidth, fontSize, font, textColor);
    y -= 4;
    page.drawRectangle({ x: margin, y: y - 44, width: contentWidth, height: 46, color: rgb(0.98, 0.96, 0.90), borderColor: rgb(0.8, 0.7, 0.4), borderWidth: 0.75 });
    y -= 6;
    drawWrappedLine('Wire Fraud Warning: IMPORTANT: Attorney Broker Services will NEVER send wire transfer instructions solely by email. Before wiring any funds, you must call our office using a phone number you have independently verified — not one provided in an email — to verbally confirm wire instructions. Wire fraud is common in real estate transactions. We will never be offended by your verification call.', margin + 8, contentWidth - 16, fontSize, fontBold, rgb(0.5, 0.35, 0.0));
    y -= 8;

    sectionHeading('4. Electronic Communications & Signatures');
    drawWrappedLine('Electronic Consent: By working with Attorney Broker Services, you consent to receive communications by email, text message, and through digital platforms. Electronic signatures obtained through our platforms are valid and enforceable under the Texas Uniform Electronic Transactions Act (TUETA) and the federal ESIGN Act.', margin, contentWidth, fontSize, font, textColor);
    y -= 4;
    drawWrappedLine('Communication Security: You are advised to verify the identity of anyone requesting action via electronic communication, particularly requests involving money, wire transfers, or changes to closing instructions.', margin, contentWidth, fontSize, font, textColor);

    sectionHeading('5. Fair Housing');
    drawWrappedLine('Our Commitment: Attorney Broker Services is committed to full compliance with all federal, state, and local fair housing laws. All AI-generated marketing materials, property descriptions, and client communications are reviewed for compliance with fair housing requirements before use. We do not discriminate on the basis of race, color, national origin, religion, sex, familial status, disability, or any other protected class.', margin, contentWidth, fontSize, font, textColor);

    sectionHeading('6. Limitations & Disclaimers');
    drawWrappedLine('Not Legal Advice: Nothing provided by Attorney Broker Services, its agents, or its technology tools constitutes legal advice. For legal questions regarding your transaction, you should consult a licensed Texas attorney.', margin, contentWidth, fontSize, font, textColor);
    y -= 4;
    drawWrappedLine('Market Data: Market analyses, valuations, comparable sales data, and financial estimates are provided for informational and discussion purposes only. They are not appraisals and should not be relied upon as a guarantee of value.', margin, contentWidth, fontSize, font, textColor);
    y -= 4;
    drawWrappedLine('AI Limitations: AI tools may produce inaccurate, incomplete, or outdated information. Your agent\'s professional review is your primary protection against errors.', margin, contentWidth, fontSize, font, textColor);

    sectionHeading('Client Acknowledgement');
    drawWrappedLine('By signing below, I/we acknowledge that I/we have received, read, and understood this Client Technology & AI Use Disclosure. I/we understand that Attorney Broker Services uses AI-assisted tools in connection with real estate services, that all such content is reviewed by a licensed agent before delivery, and that this disclosure does not constitute legal advice. I/we agree to independently verify wire instructions by phone before transmitting any funds.', margin, contentWidth, fontSize, font, textColor);
    y -= 14;

    // ── Signatures ──
    drawLine(`Client: ${d.client_name}`, margin + 12, fontSize, fontBold, textColor);
    drawLine('________________________________', margin + 12, fontSize, font, mutedColor);
    y -= 6;
    if (d.client_2_name) {
      drawLine(`Client 2: ${d.client_2_name}`, margin + 12, fontSize, fontBold, textColor);
      drawLine('________________________________', margin + 12, fontSize, font, mutedColor);
      y -= 6;
    }
    drawLine(`Agent: ${agentDisplayName}${d.agent_license_number ? ' · License #' + d.agent_license_number : ''}`, margin + 12, fontSize, fontBold, textColor);
    drawLine('________________________________', margin + 12, fontSize, font, mutedColor);
    drawLine(`Brokerage: ${brokerageName} · License #9007529`, margin + 12, fontSize, font, mutedColor);

    // ── Footer (drawn directly, never forces an extra page) ──
    page.drawText('Attorney Broker Services, LLC · For informational purposes only — not legal advice', {
      x: margin, y: 22, size: 7, font, color: rgb(0.6, 0.6, 0.6),
    });

    const pdfBytes = await pdfDoc.save();

    const safeName = (d.client_name || 'client').replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    const fileName = `ai-disclosure-${safeName}-${disclosureId.slice(0, 8)}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from('client-disclosures')
      .upload(fileName, Buffer.from(pdfBytes), {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      return { statusCode: 500, body: JSON.stringify({ error: 'PDF generated but upload failed: ' + uploadError.message }) };
    }

    const { data: publicUrlData } = supabase.storage.from('client-disclosures').getPublicUrl(fileName);
    const fileUrl = publicUrlData.publicUrl;

    await supabase.rpc('update_disclosure_pdf', {
      p_id: disclosureId,
      p_unsigned_pdf_url: fileUrl,
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, file_url: fileUrl, file_name: fileName }),
    };
  } catch (error) {
    console.error('PDF generation error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
