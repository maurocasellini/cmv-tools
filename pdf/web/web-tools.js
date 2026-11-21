/* Web version: only offer tools that run entirely in the browser. */
(() => {
  const UNAVAILABLE = ['ocr', 'office_to_pdf', 'pdf_to_word', 'pdf_to_office'];
  for (const id of UNAVAILABLE) delete TOOLS[id];
  for (const cat of CATEGORIES) cat.tools = cat.tools.filter((id) => TOOLS[id]);
  for (let i = CATEGORIES.length - 1; i >= 0; i--) if (!CATEGORIES[i].tools.length) CATEGORIES.splice(i, 1);
  // browsers cannot read HEIC
  TOOLS.images_to_pdf.accept = 'image/jpeg,image/png,image/webp,image/gif,image/bmp,image/tiff';
  TOOLS.images_to_pdf.desc = 'JPG, PNG, WebP & Co. zu einem PDF zusammenfassen.';
  TOOLS.merge.accept = '.pdf,application/pdf,image/jpeg,image/png,image/webp';
})();
