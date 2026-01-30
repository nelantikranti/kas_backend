import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import * as fs from "fs";
import * as path from "path";

// Extended Quotation interface for PDF generation
interface Quotation {
  id: string;
  leadId: string;
  leadName: string;
  projectAddress?: string;
  contactNumber?: string;
  elevatorType: string;
  modelNumber?: string;
  floors: number;
  capacity: number;
  speed: number;
  shaftType?: string;
  application?: string;
  cabinType?: string;
  doorType?: string;
  features: string[];
  // Cost breakdown
  standardRates?: {
    basicCost: number;
    shaftMasonry: number;
    shaftFilling: number;
    installation: number;
    extraTravelHeight: number;
    premiumCabin: number;
    multiColorLED: number;
    glassDoor: number;
    premiumRALColor: number;
    customizedCabinSize: number;
    transportation: number;
    advancedFeatures: number;
  };
  signatureRates?: {
    basicCost: number;
    shaftMasonry: number;
    shaftFilling: number;
    installation: number;
    extraTravelHeight: number;
    premiumCabin: number;
    multiColorLED: number;
    glassDoor: number;
    premiumRALColor: number;
    customizedCabinSize: number;
    transportation: number;
    advancedFeatures: number;
  };
  standardTotal?: number;
  standardGST?: number;
  standardNet?: number;
  signatureTotal?: number;
  signatureGST?: number;
  signatureNet?: number;
  timeOfDelivery?: string;
  paymentTerms?: {
    percentage1: number;
    amount1: number;
    percentage2: number;
    amount2: number;
  };
  // Legacy fields
  basePrice: number;
  installationCost: number;
  tax: number;
  totalAmount: number;
  status: "Pending" | "Approved" | "Rejected";
  createdAt: string;
  validUntil: string;
  version: number;
}

// Helper function to format currency
const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
};

// Helper function to format date
const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

// Helper function to load image (returns null if not found)
const loadImage = async (imagePath: string): Promise<Uint8Array | null> => {
  try {
    if (fs.existsSync(imagePath)) {
      return fs.readFileSync(imagePath);
    }
    return null;
  } catch (error) {
    console.warn(`Could not load image from ${imagePath}:`, error);
    return null;
  }
};

export async function generateQuotationPDF(quotation: Quotation): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const pageWidth = 595.28; // A4 width in points
  const pageHeight = 841.89; // A4 height in points

  // Load fonts
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Get image directory path (adjust based on your setup)
  // Try multiple possible paths
  const possiblePaths = [
    path.join(__dirname, '../../images/quotations'),
    path.join(process.cwd(), 'images/quotations'),
    path.join(process.cwd(), 'backend/images/quotations'),
  ];
  
  let imageDir = possiblePaths.find(p => fs.existsSync(p)) || possiblePaths[0];
  
  // Default values for missing fields
  const projectAddress = quotation.projectAddress || "Alwaal";
  const contactNumber = quotation.contactNumber || "+91 9603295811";
  const modelNumber = quotation.modelNumber || "KAS-GX630";
  const shaftType = quotation.shaftType || "G S";
  const application = quotation.application || "Outdoor";
  const cabinType = quotation.cabinType || "Standard";
  const doorType = quotation.doorType || "Automatic Door";
  
  // Calculate totals if not provided
  const standardRates = quotation.standardRates || {
    basicCost: 1450000,
    shaftMasonry: 0,
    shaftFilling: 0,
    installation: 60000,
    extraTravelHeight: 0,
    premiumCabin: 80000,
    multiColorLED: 25000,
    glassDoor: 75000,
    premiumRALColor: 45000,
    customizedCabinSize: 40000,
    transportation: 50000,
    advancedFeatures: 112000,
  };

  const signatureRates = quotation.signatureRates || {
    basicCost: 1440000,
    shaftMasonry: 0,
    shaftFilling: 0,
    installation: 0,
    extraTravelHeight: 0,
    premiumCabin: 0,
    multiColorLED: 0,
    glassDoor: 0,
    premiumRALColor: 0,
    customizedCabinSize: 0,
    transportation: 0,
    advancedFeatures: 0,
  };

  const standardTotal = quotation.standardTotal || Object.values(standardRates).reduce((a, b) => a + b, 0);
  const standardGST = quotation.standardGST || Math.round(standardTotal * 0.18);
  const standardNet = quotation.standardNet || standardTotal + standardGST;

  const signatureTotal = quotation.signatureTotal || Object.values(signatureRates).reduce((a, b) => a + b, 0);
  const signatureGST = quotation.signatureGST || Math.round(signatureTotal * 0.18);
  const signatureNet = quotation.signatureNet || signatureTotal + signatureGST;

  const timeOfDelivery = quotation.timeOfDelivery || "3 months from customer's confirmation of drawings and finishes.";
  
  const paymentTerms = quotation.paymentTerms || {
    percentage1: 50,
    amount1: Math.round(signatureNet * 0.5),
    percentage2: 50,
    amount2: Math.round(signatureNet * 0.5),
  };

  // ========== PAGE 1: COVER PAGE WITH IMAGE ==========
  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  
  // Try to load and embed cover page image
  const coverImagePath = path.join(imageDir, 'page1-cover.jpg');
  const coverImageBytes = await loadImage(coverImagePath);
  
  if (coverImageBytes) {
    try {
      const coverImage = await pdfDoc.embedJpg(coverImageBytes);
      page.drawImage(coverImage, {
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
      });
    } catch (error) {
      console.warn('Could not embed cover image, using fallback layout');
    }
  }

  // Overlay dynamic text on cover page
  // Client Name
  page.drawText(quotation.leadName, {
    x: 50,
    y: pageHeight - 400,
    size: 12,
    font: helveticaBoldFont,
    color: rgb(0, 0, 0),
  });

  // Project Address
  page.drawText(projectAddress, {
    x: 50,
    y: pageHeight - 425,
    size: 12,
    font: helveticaBoldFont,
    color: rgb(0, 0, 0),
  });

  // Contact Number
  page.drawText(contactNumber, {
    x: 300,
    y: pageHeight - 425,
    size: 12,
    font: helveticaBoldFont,
    color: rgb(0, 0, 0),
  });

  // Date of Quotation
  page.drawText(formatDate(quotation.createdAt), {
    x: 300,
    y: pageHeight - 450,
    size: 12,
    font: helveticaBoldFont,
    color: rgb(0, 0, 0),
  });

  // Model Number
  page.drawText(`MODEL NUMBER: ${modelNumber}`, {
    x: 50,
    y: pageHeight - 550,
    size: 16,
    font: helveticaBoldFont,
    color: rgb(1, 1, 1),
  });

  // ========== PAGE 2: ABOUT US (Keep as is - just image) ==========
  page = pdfDoc.addPage([pageWidth, pageHeight]);
  const aboutImagePath = path.join(imageDir, 'page2-about.jpg');
  const aboutImageBytes = await loadImage(aboutImagePath);
  
  if (aboutImageBytes) {
    try {
      const aboutImage = await pdfDoc.embedJpg(aboutImageBytes);
      page.drawImage(aboutImage, {
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
      });
    } catch (error) {
      console.warn('Could not embed about us image');
    }
  }

  // ========== PAGE 3: LIFT SPECIFICATION ==========
  page = pdfDoc.addPage([pageWidth, pageHeight]);
  
  // Try to load background image
  const specImagePath = path.join(imageDir, 'page3-specification.jpg');
  const specImageBytes = await loadImage(specImagePath);
  
  if (specImageBytes) {
    try {
      const specImage = await pdfDoc.embedJpg(specImageBytes);
      page.drawImage(specImage, {
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
      });
    } catch (error) {
      console.warn('Could not embed specification image');
    }
  }

  // Overlay dynamic specification data
  const specData = [
    { label: 'Model Number', value: modelNumber },
    { label: 'Application', value: application },
    { label: 'Shaft Type', value: shaftType },
    { label: 'Number Of Stops', value: `G+${quotation.floors} Stops` },
    { label: 'Cabin Type', value: cabinType },
    { label: 'Rated Load', value: `Upto ${quotation.capacity} Kg` },
    { label: 'Power Efficiency and Usage', value: 'Class A, 230V, 1 Phase 50Hz' },
    { label: 'Max Speed', value: `Up to ${quotation.speed}m / second` },
    { label: 'Door type', value: doorType },
  ];

  // Draw specification table (adjust positions based on your image layout)
  let yPos = pageHeight - 200;
  specData.forEach((item, index) => {
    page.drawText(item.value, {
      x: 300,
      y: yPos - (index * 35),
      size: 11,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
  });

  // ========== PAGE 4: FEATURES (Keep as is - just image) ==========
  page = pdfDoc.addPage([pageWidth, pageHeight]);
  const featuresImagePath = path.join(imageDir, 'page4-features.jpg');
  const featuresImageBytes = await loadImage(featuresImagePath);
  
  if (featuresImageBytes) {
    try {
      const featuresImage = await pdfDoc.embedJpg(featuresImageBytes);
      page.drawImage(featuresImage, {
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
      });
    } catch (error) {
      console.warn('Could not embed features image');
    }
  }

  // ========== PAGE 5: PAYMENT DETAILS & COST BREAKDOWN ==========
  page = pdfDoc.addPage([pageWidth, pageHeight]);
  
  // Payment details at top (same as image)
  const paymentImagePath = path.join(imageDir, 'page5-payment-top.jpg');
  const paymentImageBytes = await loadImage(paymentImagePath);
  
  if (paymentImageBytes) {
    try {
      const paymentImage = await pdfDoc.embedJpg(paymentImageBytes);
      page.drawImage(paymentImage, {
        x: 0,
        y: pageHeight - 200, // Adjust based on image size
        width: pageWidth,
        height: 200,
      });
    } catch (error) {
      console.warn('Could not embed payment details image');
    }
  }

  // Cost breakdown table
  const costItems = [
    { name: 'Basic Cost', standard: standardRates.basicCost, signature: signatureRates.basicCost },
    { name: 'Shaft - Masonry by Others', standard: standardRates.shaftMasonry, signature: signatureRates.shaftMasonry },
    { name: 'Shaft Filling', standard: standardRates.shaftFilling, signature: signatureRates.shaftFilling },
    { name: 'Installation', standard: standardRates.installation, signature: signatureRates.installation },
    { name: 'Extra Travel Height Cost', standard: standardRates.extraTravelHeight, signature: signatureRates.extraTravelHeight },
    { name: 'Premium Cabin (Glass/Mirror/RAL/Wood Finish)', standard: standardRates.premiumCabin, signature: signatureRates.premiumCabin },
    { name: 'Multi Colour LED Ceiling', standard: standardRates.multiColorLED, signature: signatureRates.multiColorLED },
    { name: 'Glass Door', standard: standardRates.glassDoor, signature: signatureRates.glassDoor },
    { name: 'Premium RAL Colour for Door', standard: standardRates.premiumRALColor, signature: signatureRates.premiumRALColor },
    { name: 'Customised Cabin Size', standard: standardRates.customizedCabinSize, signature: signatureRates.customizedCabinSize },
    { name: 'Transportation & Unloading', standard: standardRates.transportation, signature: signatureRates.transportation },
    { name: 'Advanced Features (20 inch Touch Screen, Biometric, camera Compatibility)', standard: standardRates.advancedFeatures, signature: signatureRates.advancedFeatures },
  ];

  // Draw cost breakdown table
  let tableY = pageHeight - 250;
  const tableStartX = 50;
  const col1Width = 250;
  const col2Width = 150;
  const col3Width = 150;

  // Table header
  page.drawText('KAS', {
    x: tableStartX,
    y: tableY,
    size: 12,
    font: helveticaBoldFont,
    color: rgb(0, 0, 0),
  });
  page.drawText('Standard Rate', {
    x: tableStartX + col1Width,
    y: tableY,
    size: 12,
    font: helveticaBoldFont,
    color: rgb(0, 0, 0),
  });
  page.drawText('Signature Rate', {
    x: tableStartX + col1Width + col2Width,
    y: tableY,
    size: 12,
    font: helveticaBoldFont,
    color: rgb(0, 0, 0),
  });

  tableY -= 25;
  costItems.forEach((item, index) => {
    const rowY = tableY - (index * 20);
    
    // Item name
    page.drawText(item.name, {
      x: tableStartX,
      y: rowY,
      size: 9,
      font: helveticaFont,
      color: rgb(0, 0, 0),
      maxWidth: col1Width - 10,
    });

    // Standard rate
    const standardText = item.standard === 0 ? '-' : formatCurrency(item.standard);
    page.drawText(standardText, {
      x: tableStartX + col1Width,
      y: rowY,
      size: 9,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });

    // Signature rate
    const signatureText = item.signature === 0 ? (item.name.includes('Shaft Filling') || item.name.includes('Installation') || item.name.includes('Premium Cabin') || item.name.includes('LED') || item.name.includes('Glass Door') || item.name.includes('RAL') || item.name.includes('Customised') || item.name.includes('Transportation') ? 'Included' : '₹0') : formatCurrency(item.signature);
    page.drawText(signatureText, {
      x: tableStartX + col1Width + col2Width,
      y: rowY,
      size: 9,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
  });

  // Totals
  const totalsY = tableY - (costItems.length * 20) - 20;
  page.drawText('Total', {
    x: tableStartX,
    y: totalsY,
    size: 11,
    font: helveticaBoldFont,
    color: rgb(0, 0, 0),
  });
  page.drawText(formatCurrency(standardTotal), {
    x: tableStartX + col1Width,
    y: totalsY,
    size: 11,
    font: helveticaBoldFont,
    color: rgb(0, 0, 0),
  });
  page.drawText(formatCurrency(signatureTotal), {
    x: tableStartX + col1Width + col2Width,
    y: totalsY,
    size: 11,
    font: helveticaBoldFont,
    color: rgb(0, 0, 0),
  });

  page.drawText('GST 18%', {
    x: tableStartX,
    y: totalsY - 20,
    size: 11,
    font: helveticaBoldFont,
    color: rgb(0, 0, 0),
  });
  page.drawText(formatCurrency(standardGST), {
    x: tableStartX + col1Width,
    y: totalsY - 20,
    size: 11,
    font: helveticaBoldFont,
    color: rgb(0, 0, 0),
  });
  page.drawText(formatCurrency(signatureGST), {
    x: tableStartX + col1Width + col2Width,
    y: totalsY - 20,
    size: 11,
    font: helveticaBoldFont,
    color: rgb(0, 0, 0),
  });

  page.drawText('Nett', {
    x: tableStartX,
    y: totalsY - 40,
    size: 11,
    font: helveticaBoldFont,
    color: rgb(0, 0, 0),
  });
  page.drawText(formatCurrency(standardNet), {
    x: tableStartX + col1Width,
    y: totalsY - 40,
    size: 11,
    font: helveticaBoldFont,
    color: rgb(0, 0, 0),
  });
  page.drawText(formatCurrency(signatureNet), {
    x: tableStartX + col1Width + col2Width,
    y: totalsY - 40,
    size: 11,
    font: helveticaBoldFont,
    color: rgb(0, 0, 0),
  });

  // ========== PAGE 6: PAYMENT TERMS ==========
  page = pdfDoc.addPage([pageWidth, pageHeight]);
  
  // Payment terms table with dynamic data
  const paymentTermsY = pageHeight - 150;
  
  // Table header
  page.drawRectangle({
    x: 50,
    y: paymentTermsY - 30,
    width: pageWidth - 100,
    height: 30,
    color: rgb(0.09, 0.64, 0.29), // Green
  });

  page.drawText('Payment Terms', {
    x: 60,
    y: paymentTermsY - 20,
    size: 12,
    font: helveticaBoldFont,
    color: rgb(1, 1, 1),
  });

  // Payment terms rows
  const paymentTermsData = [
    { label: 'Total Cost', value: `${formatCurrency(signatureNet)} (inc Tax)` },
    { label: 'Time of Delivery', value: timeOfDelivery },
    { label: 'Payment Terms', value: `${paymentTerms.percentage1}% While Placing order ${formatCurrency(paymentTerms.amount1)}` },
    { label: '', value: `${paymentTerms.percentage2}% Against Readiness Notification: ${formatCurrency(paymentTerms.amount2)}` },
  ];

  paymentTermsData.forEach((term, index) => {
    const rowY = paymentTermsY - 60 - (index * 40);
    
    if (term.label) {
      page.drawText(term.label, {
        x: 60,
        y: rowY,
        size: 11,
        font: helveticaBoldFont,
        color: rgb(0, 0, 0),
      });
    }
    
    page.drawText(term.value, {
      x: 60,
      y: rowY - 15,
      size: 10,
      font: helveticaFont,
      color: rgb(0, 0, 0),
      maxWidth: pageWidth - 120,
    });
  });

  // ========== PAGE 7+: TERMS & CONDITIONS (Keep as is - images) ==========
  const termsImagePaths = [
    path.join(imageDir, 'page7-terms1.jpg'),
    path.join(imageDir, 'page8-terms2.jpg'),
    path.join(imageDir, 'page9-terms3.jpg'),
  ];

  for (const termsImagePath of termsImagePaths) {
    const termsImageBytes = await loadImage(termsImagePath);
    if (termsImageBytes) {
      try {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        const termsImage = await pdfDoc.embedJpg(termsImageBytes);
        page.drawImage(termsImage, {
          x: 0,
          y: 0,
          width: pageWidth,
          height: pageHeight,
        });
      } catch (error) {
        console.warn(`Could not embed terms image: ${termsImagePath}`);
      }
    }
  }

  // If no terms images found, create a basic terms page
  if (!termsImagePaths.some(p => fs.existsSync(p))) {
    page = pdfDoc.addPage([pageWidth, pageHeight]);
    
    page.drawText('Terms & Conditions', {
      x: 50,
      y: pageHeight - 50,
      size: 24,
      font: helveticaBoldFont,
      color: rgb(0.09, 0.64, 0.29),
    });

    const terms = [
      'Payment: For seamless online payment experiences, customers should forward transaction details (name, city, amount) to crm@kashomeelevators.com. Upon successful payment, an acknowledgment and receipt will be provided.',
      'Power Connection: For optimum performance, a stabilized Single Phase 230V - 50/60 Hz power connection is required, complemented by a minimum 32 Amp supply and a circuit breaker.',
      'Civil Works & Structural Support: Customer partnership is essential. For lift installation, customers are requested to manage any required civil works and arrange for structural support if needed.',
      'Installation Flexibility: Installation requests outside of standard working hours can be accommodated, subject to a nominal fee and the team\'s availability.',
      'Warranties: 5-year warranty for motors, a 7-year manufacturer warranty against rusting, and a 1-year service warranty. These warranties are contingent on the lift receiving regular care and service by trained KAS Home Elevators experts.',
      'Legal Standards: Operations uphold India\'s legal standards, and disputes will be addressed exclusively within India\'s jurisdiction.',
      'Safety Compliance: Compliance with safety standards established by regulatory bodies in India, Europe, Australia, and the United States.',
    ];

    let yPos = pageHeight - 100;
    terms.forEach((term, index) => {
      if (yPos < 100) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        yPos = pageHeight - 50;
      }
      
      page.drawText(`${index + 1}. ${term}`, {
        x: 50,
        y: yPos,
        size: 10,
        font: helveticaFont,
        color: rgb(0, 0, 0),
        maxWidth: pageWidth - 100,
      });
      
      yPos -= 80;
    });

    // Signature area
    page.drawText('Yours sincerely,', {
      x: 50,
      y: 100,
      size: 10,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    page.drawText('Sujith R', {
      x: 50,
      y: 85,
      size: 10,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    page.drawText('KAS HOME ELEVATORS', {
      x: 50,
      y: 70,
      size: 10,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    page.drawText('Customer Signature', {
      x: pageWidth - 150,
      y: 70,
      size: 10,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
  }

  // Serialize PDF
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
