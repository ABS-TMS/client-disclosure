// netlify/functions/sealDisclosure.js
//
// Embeds agent + client signatures into the unsigned disclosure PDF,
// uploads the executed version, marks the record executed.
//
// Supports two call shapes:
// IN-PERSON: { disclosureId, agentSignatureDataUrl, clientSignatureDataUrl, clientTypedName }
// REMOTE:    { signingToken, clientSignatureDataUrl, clientTypedName }

const { PDFDocument, rgb } = require('pdf-lib');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://petfaclkzdudyvyhifaj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_H6IVVyBLqTTsub1zH_igSw_EqimRQ9Y';

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  return Buffer.from(base64, 'base64');
}

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

  const { signingToken, clientSignatureDataUrl, clientTypedName } = payload;
  let { disclosureId, agentSignatureDataUrl } = payload;

  if (!clientSignatureDataUrl || !clientTypedName) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing client signature or name' }) };
  }
  if (!disclosureId && !signingToken) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Either disclosureId or signingToken is required' }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  try {
    if (signingToken) {
      const { data: tokenResult, error: tokenError } = await supabase
        .rpc('get_disclosure_by_token', { p_token: signingToken })
        .single();

      if (tokenError || !tokenResult) {
        return { statusCode: 404, body: JSON.stringify({ error: 'This signing link is invalid or has expired.' }) };
      }

      disclosureId = tokenResult.disclosure_id;
    }

    if (!agentSignatureDataUrl) {
      const { data: existing } = await supabase
        .rpc('get_disclosure', { p_id: disclosureId })
        .single();
      agentSignatureDataUrl = existing?.agent_signature_data_url;
    }

    if (!agentSignatureDataUrl) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No agent signature found for this disclosure.' }) };
    }

    const { data: disclosure, error: fetchError } = await supabase
      .rpc('get_disclosure', { p_id: disclosureId })
      .single();

    if (fetchError || !disclosure) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Disclosure not found' }) };
    }

    if (!disclosure.unsigned_pdf_url) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No unsigned PDF exists for this disclosure yet' }) };
    }

    const pdfResponse = await fetch(disclosure.unsigned_pdf_url);
    if (!pdfResponse.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Could not fetch the unsigned PDF' }) };
    }
    const existingPdfBytes = await pdfResponse.arrayBuffer();

    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const pages = pdfDoc.getPages();
    const lastPage = pages[pages.length - 1];

    const agentSigBytes = dataUrlToBytes(agentSignatureDataUrl);
    const clientSigBytes = dataUrlToBytes(clientSignatureDataUrl);
    const agentSigImage = await pdfDoc.embedPng(agentSigBytes);
    const clientSigImage = await pdfDoc.embedPng(clientSigBytes);

    const sigWidth = 160;
    const margin = 62;
    const agentSigScale = sigWidth / agentSigImage.width;
    const clientSigScale = sigWidth / clientSigImage.width;

    // Disclosure has a shorter, simpler signature block than Showing
    // Tour Agreement -- client, optional client 2, then agent -- so
    // signatures land relative to the bottom of whatever page the
    // signature lines ended up on.
    const hasSecondClient = !!disclosure.client_2_name;
    const clientSigY = hasSecondClient ? 170 : 130;
    const agentSigY = 70;

    lastPage.drawImage(clientSigImage, {
      x: margin, y: clientSigY,
      width: clientSigImage.width * clientSigScale,
      height: clientSigImage.height * clientSigScale,
    });

    lastPage.drawImage(agentSigImage, {
      x: margin, y: agentSigY,
      width: agentSigImage.width * agentSigScale,
      height: agentSigImage.height * agentSigScale,
    });

    lastPage.drawText(`Signed electronically by ${clientTypedName}`, {
      x: margin, y: agentSigY - 12, size: 7, color: rgb(0.4, 0.4, 0.4),
    });

    const sealedTimestamp = new Date().toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
    });
    lastPage.drawText(`Executed: ${sealedTimestamp}`, {
      x: margin, y: agentSigY - 22, size: 7, color: rgb(0.4, 0.4, 0.4),
    });

    const sealedPdfBytes = await pdfDoc.save();

    const safeName = (disclosure.client_name || 'client').replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    const fileName = `ai-disclosure-${safeName}-${disclosureId.slice(0, 8)}-executed.pdf`;

    const { error: uploadError } = await supabase.storage
      .from('client-disclosures')
      .upload(fileName, Buffer.from(sealedPdfBytes), {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Sealed PDF created but upload failed: ' + uploadError.message }) };
    }

    const { data: publicUrlData } = supabase.storage.from('client-disclosures').getPublicUrl(fileName);
    const executedUrl = publicUrlData.publicUrl;

    const { error: sealError } = await supabase.rpc('seal_disclosure', {
      p_id: disclosureId,
      p_agent_signature_data_url: agentSignatureDataUrl,
      p_client_signature_data_url: clientSignatureDataUrl,
      p_client_typed_name: clientTypedName,
      p_executed_pdf_url: executedUrl,
    });

    if (sealError) {
      return { statusCode: 500, body: JSON.stringify({ error: 'PDF sealed but record update failed: ' + sealError.message }) };
    }

    if (signingToken) {
      await supabase.rpc('mark_disclosure_token_used', { p_token: signingToken });
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, file_url: executedUrl }),
    };
  } catch (error) {
    console.error('Seal disclosure error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
