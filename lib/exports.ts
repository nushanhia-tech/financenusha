import "server-only";
import { join } from "node:path";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { dateLabel, inr, safeTextForSpreadsheet, type StoreRow } from "./model";

const headers=(rows:StoreRow[])=>Object.keys(rows[0]??{});
const display=(value:unknown)=>value===null||value===undefined?"":String(value);
const quote=(cell:unknown)=>'"'+(typeof cell==="string"?safeTextForSpreadsheet(cell):display(cell)).replaceAll('"','""')+'"';
export function csv(rows:StoreRow[]) {
  const keys=headers(rows);
  return "\uFEFF"+[keys.map(quote).join(","),...rows.map(row=>keys.map(key=>quote(row[key])).join(","))].join("\r\n");
}
export async function workbook(title:string,rows:StoreRow[]) {
  const file=new ExcelJS.Workbook();
  const sheet=file.addWorksheet(title.slice(0,31).replace(/[\[\]*?/:\\]/g,""));
  const keys=headers(rows);
  sheet.columns=keys.map(key=>({header:key,key,width:Math.max(18,Math.min(42,key.length+8))}));
  rows.forEach(row=>sheet.addRow(keys.map(key=>typeof row[key]==="number"?row[key]:display(row[key]))));
  if(keys.length) {
    sheet.getRow(1).font={bold:true,color:{argb:"FFFFFFFF"}};
    sheet.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF14243A"}};
    sheet.views=[{state:"frozen",ySplit:1}];
    sheet.autoFilter={from:{row:1,column:1},to:{row:1,column:keys.length}};
  }
  return new Uint8Array(await file.xlsx.writeBuffer());
}

const printable = (text:string)=>text.replaceAll("₹","INR ").replace(/[\u2013\u2014]/g,"-").replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"');
const formatNumber = (number:number)=>inr.format(number).replace(/\s*₹\s*/,"");
export async function pdf(title:string,subtitle:string,rows:StoreRow[],receipt=false) {
  const doc=new PDFDocument({size:"A4",layout:!receipt&&headers(rows).length>6?"landscape":"portrait",margin:44,bufferPages:true,info:{Title:title,Author:"NUSHA Students Union"}});
  doc.registerFont("Noto",join(process.cwd(),"assets","fonts","NotoSansMalayalam.ttf"));
  const chunks:Buffer[]=[];
  const completed=new Promise<Uint8Array>((resolve,reject)=>{
    doc.on("data",chunk=>chunks.push(chunk));
    doc.on("error",reject);
    doc.on("end",()=>resolve(new Uint8Array(Buffer.concat(chunks))));
  });
  const main="#14243A",muted="#5D6D83",blue="#2563EB",line="#DDE5F2";
  const left=44;
  const width=()=>doc.page.width-88;
  const size=rows.length>500?8:9;
  function banner() {
    doc.rect(0,0,doc.page.width,100).fill(main);
    doc.font("Helvetica-Bold").fontSize(16).fillColor("#FFFFFF").text("NUSHA FINANCE",left,35,{lineBreak:false});
    doc.font("Helvetica").fontSize(9).fillColor("#BCCDF3").text("NUSHA STUDENTS UNION",left,60,{lineBreak:false});
    doc.font("Helvetica-Bold").fontSize(23).fillColor(main).text(printable(title),left,120,{width:width()});
    doc.moveDown(0.4).font("Helvetica").fontSize(10).fillColor(muted).text(printable(subtitle),{width:width()});
    doc.moveDown(1.3);
  }
  banner();
  if(receipt) {
    rows.forEach(row=>Object.entries(row).forEach(([key,val])=>{
      const y=doc.y;
      doc.font("Helvetica-Bold").fontSize(10).fillColor(muted).text(key,left,y,{width:140});
      doc.font("Noto").fontSize(12).fillColor(main).text(display(val),left+150,y,{width:width()-150});
      doc.moveDown(0.9);
    }));
  } else if(!rows.length) {
    doc.font("Helvetica").fontSize(11).fillColor(muted).text("No records matched this report.",left,doc.y);
  } else {
    const keys=headers(rows);
    const span=width()/keys.length;
    function tableHeader() {
      const y=doc.y;
      doc.rect(left,y,width(),26).fill("#EAF1FE");
      keys.forEach((key,index)=>doc.font("Helvetica-Bold").fontSize(8).fillColor(blue).text(printable(key),left+index*span+5,y+7,{width:span-10,height:14,ellipsis:true}));
      doc.x=left;
      doc.y=y+27;
    }
    tableHeader();
    rows.forEach((row,index)=>{
      const vals=keys.map(key=>typeof row[key]==="number"?formatNumber(row[key] as number):display(row[key]));
      doc.font("Noto").fontSize(size);
      const height=Math.min(74,Math.max(23,...vals.map(val=>doc.heightOfString(val,{width:span-10})+12)));
      if(doc.y+height>doc.page.height-58) {doc.addPage();banner();tableHeader();}
      const y=doc.y;
      if(index%2===0)doc.rect(left,y,width(),height).fill("#F6F8FC");
      vals.forEach((val,k)=>doc.font("Noto").fontSize(size).fillColor(main).text(val,left+k*span+5,y+6,{width:span-10,height:height-9,ellipsis:true}));
      doc.moveTo(left,y+height).lineTo(left+width(),y+height).lineWidth(0.35).strokeColor(line).stroke();
      doc.x=left;
      doc.y=y+height;
    });
  }
  const pages=doc.bufferedPageRange();
  for(let i=0;i<pages.count;i++) {
    doc.switchToPage(i+pages.start);
    doc.font("Helvetica").fontSize(8).fillColor(muted).text("NUSHA Students Union  •  "+dateLabel(new Date().toISOString())+"  •  "+(i+1)+"/"+pages.count,left,doc.page.height-36,{width:width(),lineBreak:false});
  }
  doc.end();
  return completed;
}
