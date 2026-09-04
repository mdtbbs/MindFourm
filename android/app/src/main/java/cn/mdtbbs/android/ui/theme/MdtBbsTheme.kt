package cn.mdtbbs.android.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.TextStyle
import android.app.Activity
import androidx.core.view.WindowCompat

private val Midnight = Color(0xFF0F172A)
private val Ink = Color(0xFF1E293B)
private val Blue = Color(0xFF2563EB)
private val BlueSoft = Color(0xFFE8F0FF)
private val Lime = Color(0xFFA3E635)
private val Paper = Color(0xFFF6F8FC)

private val LightColors = lightColorScheme(
    primary = Blue,
    onPrimary = Color.White,
    primaryContainer = BlueSoft,
    onPrimaryContainer = Midnight,
    secondary = Color(0xFF4F46E5),
    secondaryContainer = Color(0xFFEEF2FF),
    tertiary = Color(0xFF4D7C0F),
    tertiaryContainer = Color(0xFFECFCCB),
    background = Paper,
    onBackground = Midnight,
    surface = Color.White,
    onSurface = Midnight,
    surfaceVariant = Color(0xFFEFF3FA),
    onSurfaceVariant = Color(0xFF556274),
    outline = Color(0xFFCDD6E3),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF8AB4FF),
    onPrimary = Midnight,
    primaryContainer = Color(0xFF1D4ED8),
    onPrimaryContainer = Color(0xFFE8F0FF),
    secondary = Color(0xFFC7D2FE),
    tertiary = Lime,
    background = Color(0xFF0B1220),
    onBackground = Color(0xFFE5EAF2),
    surface = Color(0xFF111C2E),
    onSurface = Color(0xFFE5EAF2),
    surfaceVariant = Color(0xFF1C2A40),
    onSurfaceVariant = Color(0xFFC1CBD9),
    outline = Color(0xFF53647C),
)

private val MdtTypography = Typography(
    displaySmall = TextStyle(fontWeight = FontWeight.Black),
    headlineSmall = TextStyle(fontWeight = FontWeight.ExtraBold),
    titleLarge = TextStyle(fontWeight = FontWeight.Bold),
    titleMedium = TextStyle(fontWeight = FontWeight.SemiBold),
    labelLarge = TextStyle(fontWeight = FontWeight.Bold),
)

@Composable
fun MdtBbsTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    val colors = if (dark) DarkColors else LightColors
    val view = LocalView.current
    SideEffect {
        val window = (view.context as? Activity)?.window ?: return@SideEffect
        window.statusBarColor = colors.background.toArgb()
        window.navigationBarColor = colors.surface.toArgb()
        WindowCompat.getInsetsController(window, view).apply {
            isAppearanceLightStatusBars = !dark
            isAppearanceLightNavigationBars = !dark
        }
    }
    MaterialTheme(
        colorScheme = colors,
        typography = MdtTypography,
        content = content,
    )
}

/** Accent used sparingly for the community's game-inspired markers. */
val MdtLime = Lime
