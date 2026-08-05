package com.homeinventory.app.data.excel

import java.io.ByteArrayInputStream
import java.time.LocalDateTime
import org.apache.poi.xssf.usermodel.XSSFWorkbook
import org.junit.Assert.assertEquals
import org.junit.Test

class ExcelBackupGeneratorTest {
    @Test
    fun generatesWorkbookWithExpectedHeaderAndRows() {
        val rows = listOf(
            BackupRow(
                index = 1,
                name = "牛奶",
                locationName = "冰箱",
                areaName = "厨房",
                note = "记得喝",
                expireDate = "2026-08-10",
            ),
        )

        val bytes = ExcelBackupGenerator.generate(rows)
        val workbook = XSSFWorkbook(ByteArrayInputStream(bytes))
        val sheet = workbook.getSheet("物品清单")
        assertEquals("序号", sheet.getRow(0).getCell(0).stringCellValue)
        assertEquals("名称", sheet.getRow(0).getCell(1).stringCellValue)
        assertEquals("格子编号", sheet.getRow(0).getCell(2).stringCellValue)
        assertEquals("所在区域", sheet.getRow(0).getCell(3).stringCellValue)
        assertEquals("牛奶", sheet.getRow(1).getCell(1).stringCellValue)
        assertEquals("冰箱", sheet.getRow(1).getCell(2).stringCellValue)
        assertEquals("厨房", sheet.getRow(1).getCell(3).stringCellValue)
        assertEquals("2026-08-10", sheet.getRow(1).getCell(5).stringCellValue)
        workbook.close()
    }

    @Test
    fun filenameMatchesWebFormat() {
        val name = ExcelBackupGenerator.filename(LocalDateTime.of(2026, 8, 5, 9, 30, 15))
        assertEquals("物品清单_2026-08-05_09-30-15.xlsx", name)
    }
}
