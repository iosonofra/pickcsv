import bwipjs from "bwip-js";

export const buildCode128Barcode = async (value: string): Promise<Buffer> => {
  return bwipjs.toBuffer({
    bcid: "code128",
    text: value,
    scale: 3,
    height: 14,
    includetext: true,
    textxalign: "center",
    backgroundcolor: "FFFFFF"
  });
};

export const buildQrCode = async (value: string): Promise<Buffer> => {
  return bwipjs.toBuffer({
    bcid: "qrcode",
    text: value,
    scale: 4,
    paddingwidth: 2,
    paddingheight: 2,
    backgroundcolor: "FFFFFF"
  });
};
