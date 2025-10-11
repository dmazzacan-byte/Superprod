/* global TomSelect, jsPDF, html2canvas, Toastify, XLSX */

import * as state from './state.js';
import { getLogoUrl } from './settings.js';

/**
 * Initializes a Tom Select instance on a given element, destroying any existing instance first.
 * @param {string|HTMLElement} elementOrSelector - The selector string or the HTML element for the select input.
 * @param {object} config - The configuration options for Tom Select.
 * @returns {TomSelect} The new Tom Select instance.
 */
export function initTomSelect(elementOrSelector, config) {
    const el = typeof elementOrSelector === 'string' ? document.querySelector(elementOrSelector) : elementOrSelector;

    if (!el) {
        console.error("Tom Select initializer: Element not found for selector:", elementOrSelector);
        return;
    }

    if (el.tomselect) {
        el.tomselect.destroy();
    }

    // Add a default placeholder if not provided
    const defaultConfig = {
        placeholder: 'Seleccione una opción...',
        ...config,
        maxOptions: null, // Show all options by default
    };

    return new TomSelect(el, defaultConfig);
}

/**
 * Generates the next sequential order ID based on existing orders.
 * @returns {number} The next available order ID.
 */
export function generateSequentialOrderId() {
  const nums = state.productionOrders.map(o => Number(o.order_id)).filter(n => !isNaN(n));
  return nums.length ? Math.max(...nums) + 1 : 1;
}

/**
 * Formats an ISO date string (YYYY-MM-DD) to DD-MM-YYYY.
 * @param {string} isoDate - The ISO date string.
 * @returns {string} The formatted date or 'N/A'.
 */
export function formatDate(isoDate) {
  if (!isoDate || typeof isoDate !== 'string') return 'N/A';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const [year, month, day] = parts;
  const dayPart = day.split('T')[0]; // Handle datetime strings
  return `${dayPart}-${month}-${year}`;
}

/**
 * Formats an ISO date string (YYYY-MM-DD) to DD-MM-YY.
 * @param {string} isoDate - The ISO date string.
 * @returns {string} The formatted short date or 'N/A'.
 */
export function formatDateShort(isoDate) {
  if (!isoDate || typeof isoDate !== 'string') return 'N/A';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const [year, month, day] = parts;
  const shortYear = year.slice(-2);
  const dayPart = day.split('T')[0]; // Handle datetime strings
  return `${dayPart}-${month}-${shortYear}`;
}

/**
 * Formats a number as a currency string (e.g., $1,234.56).
 * @param {number} value - The number to format.
 * @returns {string} The formatted currency string or 'N/A'.
 */
export function formatCurrency(value) {
  if (value === null || typeof value === 'undefined') {
    return 'N/A';
  }
  const number = parseFloat(value);
  if (isNaN(number)) {
    return 'N/A';
  }
  return `$${number.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Adds a "printable-page" class to a page element and triggers the browser's print dialog.
 * @param {string} pageId - The ID of the HTML element to print.
 */
export function printPage(pageId) {
    const page = document.getElementById(pageId);
    if (!page) return;

    window.onafterprint = () => {
        page.classList.remove('printable-page');
        window.onafterprint = null;
    };

    page.classList.add('printable-page');
    window.print();
}

/**
 * Generates a PDF from an HTML element using html2canvas and jsPDF.
 * @param {string} elementId - The ID of the HTML element to convert to PDF.
 * @param {string} filename - The desired filename for the downloaded PDF.
 */
export function generatePagePDF(elementId, filename) {
    const element = document.getElementById(elementId);
    if (!element) return;

    const spinner = document.getElementById('loader');
    if(spinner) spinner.style.display = 'flex';


    const originalDisplay = element.style.display;
    element.style.display = 'block';

    html2canvas(element, { scale: 2, useCORS: true }).then(canvas => {
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;
        const ratio = canvasWidth / canvasHeight;
        const width = pdfWidth;
        const height = width / ratio;

        let position = 0;
        let heightLeft = height;

        pdf.addImage(imgData, 'PNG', 0, position, width, height);
        heightLeft -= pdfHeight;

        while (heightLeft > 0) {
            position = heightLeft - height;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, position, width, height);
            heightLeft -= pdfHeight;
        }

        pdf.save(filename);
        element.style.display = originalDisplay;
    }).catch(err => {
        console.error('Error generating PDF:', err);
        Toastify({ text: 'Error al generar el PDF.', backgroundColor: 'var(--danger-color)' }).showToast();
        element.style.display = originalDisplay;
    }).finally(() => {
        if(spinner) spinner.style.display = 'none';
    });
}

/**
 * Creates and downloads an Excel file from an array of objects.
 * @param {string} filename - The desired filename (e.g., 'data.xlsx').
 * @param {string} sheetName - The name for the worksheet.
 * @param {Array<object>} data - The array of data to export.
 */
export function downloadExcel(filename, sheetName, data) {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

/**
 * Calculates the cost of a recipe, including nested sub-products.
 * @param {Array<object>} items - The array of recipe items.
 * @returns {number} The total calculated cost.
 */
export function calculateRecipeCost(items) {
  if (!items || !Array.isArray(items)) {
    return 0;
  }
  return items.reduce((acc, it) => {
    if (!it || !it.type) return acc;
    if (it.type === 'product') {
        const subRecipe = state.recipes[it.code];
        return acc + (subRecipe ? calculateRecipeCost(subRecipe) * it.quantity : 0);
    } else {
        const m = state.materials.find(ma => ma.codigo === it.code);
        return acc + (m ? m.costo * it.quantity : 0);
    }
  }, 0);
}

/**
 * Identifies all product codes that are used as ingredients in other recipes.
 * @returns {Set<string>} A set of intermediate product codes.
 */
export function getIntermediateProductCodes() {
    const intermediateProducts = new Set();
    Object.values(state.recipes).flat().forEach(ing => {
        if (ing && ing.type === 'product') {
            intermediateProducts.add(ing.code);
        }
    });
    return intermediateProducts;
}

/**
 * Recursively explodes a product's Bill of Materials (BOM) to get all base raw materials.
 * @param {string} productCode - The product code to explode.
 * @param {number} requiredQty - The quantity of the product required.
 * @returns {Array<{code: string, quantity: number}>} An array of base materials and their total quantities.
 */
export function getBaseMaterials(productCode, requiredQty) {
    const baseMaterials = {};
    const recipe = state.recipes[productCode];

    if (!recipe) return [];

    recipe.forEach(ingredient => {
        const ingredientQty = ingredient.quantity * requiredQty;
        if (ingredient.type === 'product') {
            const subMaterials = getBaseMaterials(ingredient.code, ingredientQty);
            subMaterials.forEach(subMat => {
                baseMaterials[subMat.code] = (baseMaterials[subMat.code] || 0) + subMat.quantity;
            });
        } else { // 'material'
            baseMaterials[ingredient.code] = (baseMaterials[ingredient.code] || 0) + ingredientQty;
        }
    });

    return Object.entries(baseMaterials).map(([code, quantity]) => ({ code, quantity }));
}

/**
 * Generates a PDF for a single vale (warehouse receipt).
 * @param {object} vale - The vale object.
 */
export async function generateValePDF(vale) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  let logoHeight = 0;
  const logoData = await getLogoUrl();
  if (logoData) {
      const getImageDimensions = (dataUrl) => new Promise(resolve => {
          const img = new Image();
          img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
          img.src = dataUrl;
      });
      const dims = await getImageDimensions(logoData);
      const maxWidth = 40;
      const maxHeight = 20;
      const ratio = Math.min(maxWidth / dims.width, maxHeight / dims.height);
      const w = dims.width * ratio;
      const h = dims.height * ratio;
      doc.addImage(logoData, 'PNG', 15, 10, w, h);
      logoHeight = h;
  }

  doc.setFontSize(18);
  doc.text('Vale de Almacén', 105, logoHeight > 0 ? 15 + logoHeight : 25, null, null, 'center');

  let startY = (logoHeight > 0 ? 15 + logoHeight : 25) + 15;
  const lineHeight = 7;
  doc.setFontSize(11);

  doc.text(`Vale ID: ${vale.vale_id}`, 15, startY);
  startY += lineHeight;
  doc.text(`Orden: ${vale.order_id}`, 15, startY);
  startY += lineHeight;
  doc.text(`Tipo: ${vale.type === 'salida' ? 'Salida' : 'Devolución'}`, 15, startY);
  startY += lineHeight;
  doc.text(`Fecha: ${formatDate(vale.created_at)}`, 15, startY);

  const bodyRows = vale.materials.map(m => {
    const mat = state.materials.find(ma => ma.codigo === m.material_code);
    return [mat ? mat.descripcion : m.material_code, m.quantity.toFixed(2), (m.quantity * (mat ? mat.costo : 0)).toFixed(2)];
  });
  doc.autoTable({ head: [['Material', 'Cantidad', 'Costo']], body: bodyRows, startY: startY + 5 });

  const pageHeight = doc.internal.pageSize.getHeight();
  const bottomMargin = 20;
  doc.setLineWidth(0.2);
  doc.line(60, pageHeight - bottomMargin, 150, pageHeight - bottomMargin);
  doc.setFontSize(10);
  doc.text('Autorizado por:', 105, pageHeight - bottomMargin + 5, null, null, 'center');

  doc.save(`vale_${vale.vale_id}.pdf`);
}