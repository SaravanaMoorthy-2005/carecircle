import type { Mail } from '../repositories/context';
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
export function mailTemplate(
  to: string,
  subject: string,
  body: string,
  appUrl: string,
  messageId: string,
): Mail {
  return {
    to,
    subject,
    text: `CareCircle\n\n${body}\n\nOpen your secure care space: ${appUrl}\n\nCareCircle is not an emergency response service.`,
    html: `<!doctype html><html lang="en"><body style="font:18px/1.6 Arial,sans-serif;color:#193b45;background:#f6f8f5;padding:24px"><main style="max-width:560px;margin:auto;background:white;padding:32px"><h1 style="color:#176c62">CareCircle</h1><p>${escape(body).replace(/\n/g, '<br>')}</p><p><a href="${escape(appUrl)}" style="color:#155e54">Open your secure care space</a></p><p style="font-size:14px">This is not an emergency response service.</p></main></body></html>`,
    messageId,
  };
}
