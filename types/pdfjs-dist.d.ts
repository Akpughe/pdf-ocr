declare module "pdfjs-dist/webpack" {
  export * from "pdfjs-dist";
}

declare module "pdfjs-dist" {
  import * as pdfjs from "pdfjs-dist/types/src/pdf";
  export = pdfjs;
}

declare module "pdfjs-dist/legacy/build/pdf" {
  import * as pdfjs from "pdfjs-dist/types/src/pdf";
  export = pdfjs;
}

declare module "pdfjs-dist/es5/build/pdf" {
  import * as pdfjs from "pdfjs-dist/types/src/pdf";
  export = pdfjs;
}
