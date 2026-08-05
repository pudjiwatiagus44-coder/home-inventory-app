package com.homeinventory.app.data.excel

import java.io.ByteArrayOutputStream
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import org.apache.poi.xssf.usermodel.XSSFWorkbook

object ExcelBackupGenerator {
    private val HEADERS = listOf("序号", "名称", "格子编号", "所在区域", "备注", "有效期")
    private const val SHEET_NAME = "物品清单"
    private val TIMESTAMP = DateTimeFormatter.ofPattern("yyyy-MM-dd_HH-mm-ss")

    fun generate(rows: List<BackupRow>): ByteArray {
        val workbook = XSSFWorkbook()
        val sheet = workbook.createSheet(SHEET_NAME)
        val header = sheet.createRow(0)
        HEADERS.forEachIndexed { index, text -> header.createCell(index).setCellValue(text) }
        rows.forEachIndexed { rowIndex, row ->
            val excelRow = sheet.createRow(rowIndex + 1)
            excelRow.createCell(0).setCellValue(row.index.toDouble())
            excelRow.createCell(1).setCellValue(row.name)
            excelRow.createCell(2).setCellValue(row.locationName)
            excelRow.createCell(3).setCellValue(row.areaName)
            excelRow.createCell(4).setCellValue(row.note)
            excelRow.createCell(5).setCellValue(row.expireDate ?: "")
        }
        return ByteArrayOutputStream().use { output ->
            workbook.write(output)
            workbook.close()
            output.toByteArray()
        }
    }

    fun filename(now: LocalDateTime = LocalDateTime.now()): String =
        "物品清单_${now.format(TIMESTAMP)}.xlsx"
}
