# Regras do ProGuard para LeFrio Atendimento Técnico

# Manter classes de modelo e Room Entities
-keep class com.lefrio.atendimento.data.local.entity.** { *; }
-keep class com.lefrio.atendimento.data.local.dao.** { *; }
-keep class com.lefrio.atendimento.data.local.AppDatabase { *; }

# Firebase
-keepattributes *Annotation*
-dontwarn com.google.firebase.**
-keep class com.google.firebase.** { *; }

# WorkManager
-keep class androidx.work.** { *; }

# Coil
-dontwarn coil.**
-keep class coil.** { *; }
