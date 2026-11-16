const fs = require('fs');
const path = require('path');
const { withGradleProperties } = require('@expo/config-plugins');

/**
 * Plugin de config local do Expo: reaplica, a cada `expo prebuild`, os ajustes
 * necessários para compilar este app no Windows:
 *
 *  1) gradle.properties: força o CMake 3.31.6 (Ninja 1.12 com suporte a
 *     caminhos longos), evitando o erro de 260 caracteres no codegen do
 *     react-native-safe-area-context.
 *  2) proguard-rules.pro: regra para as classes JNI do LiveKit (jni_zero),
 *     sem a qual o R8 falha no build de release.
 *
 * O `withGradleProperties` garante que o mod rode DEPOIS que o template nativo
 * foi copiado pelo prebuild — momento correto para gravar ambos os arquivos.
 */

const R8_RULES = `
# LiveKit JNI (jni_zero): classe gerada em runtime, ausente no classpath do R8.
-dontwarn livekit.org.jni_zero.JniZeroJni
-keep class livekit.org.jni_zero.** { *; }
`;

module.exports = function withAndroidBuildFixes(config) {
  return withGradleProperties(config, (cfg) => {
    // 1) CMake 3.31.6 — idempotente: remove qualquer valor anterior e adiciona o novo.
    cfg.modResults = cfg.modResults.filter(
      (item) => !(item.type === 'property' && item.key === 'android.cmakeVersion')
    );
    cfg.modResults.push({
      type: 'property',
      key: 'android.cmakeVersion',
      value: '3.31.6',
    });

    // 2) Regras do R8 no proguard-rules.pro (o prebuild já copiou o template).
    try {
      const androidDir = path.resolve(process.cwd(), 'android');
      const proguard = path.join(androidDir, 'app', 'proguard-rules.pro');
      if (fs.existsSync(proguard)) {
        const content = fs.readFileSync(proguard, 'utf8');
        if (!content.includes('livekit.org.jni_zero.JniZeroJni')) {
          fs.writeFileSync(proguard, content.replace(/\s*$/, '') + '\n' + R8_RULES);
        }
      }
    } catch (error) {
      console.warn('[with-android-build-fixes] ' + error.message);
    }

    return cfg;
  });
};
