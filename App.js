import { useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View
} from 'react-native';
import {
  authenticateUser,
  createUser,
  initializeAuthDatabase,
  resetPasswordByEmail
} from './src/database/authRepository';

export default function App() {
  const { width } = useWindowDimensions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [mode, setMode] = useState('login');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info');
  const [databaseStatus, setDatabaseStatus] = useState('loading');

  const isCompactLayout = width < 420;
  const isResetMode = mode === 'reset';
  const isRegisterMode = mode === 'register';
  const isDatabaseUnavailable = databaseStatus !== 'ready';

  const cardWidth = useMemo(() => {
    if (width >= 900) return 460;
    if (width >= 600) return 420;
    return Math.max(280, width - 32);
  }, [width]);

  useEffect(() => {
    initializeAuthDatabase()
      .then(() => {
        setDatabaseStatus('ready');
      })
      .catch(() => {
        setDatabaseStatus('error');
        setMessageType('error');
        setMessage('Erro ao iniciar banco local.');
      });
  }, []);


  useEffect(() => {
    if (!message) {
      return;
    }

    AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  const clearSensitiveFields = () => {
    setPassword('');
    setNewPassword('');
    setRecoveryCode('');
  };

  const switchToMode = (nextMode) => {
    setMode(nextMode);
    clearSensitiveFields();
    setMessageType('info');
    setMessage('');
  };

  const showError = (text) => {
    setMessageType('error');
    setMessage(text);
  };

  const showSuccess = (text) => {
    setMessageType('success');
    setMessage(text);
  };

  const handleLogin = async () => {
    if (isDatabaseUnavailable) {
      showError('Banco local indisponível no momento.');
      return;
    }

    if (!email.trim() || !password) {
      showError('Informe e-mail e senha.');
      return;
    }

    try {
      const isValidUser = await authenticateUser(email, password);

      if (!isValidUser) {
        showError('Credenciais inválidas.');
        return;
      }

      showSuccess('Login realizado com sucesso.');
      clearSensitiveFields();
    } catch {
      showError('Erro ao autenticar usuário no banco local.');
    }
  };

  const handleRegister = async () => {
    if (isDatabaseUnavailable) {
      showError('Banco local indisponível no momento.');
      return;
    }

    if (!email.trim() || !password || !recoveryCode) {
      showError('Informe e-mail, senha e código de recuperação.');
      return;
    }

    try {
      const didCreateUser = await createUser(email, password, recoveryCode);

      if (!didCreateUser) {
        showError('Não foi possível criar conta. E-mail pode já existir.');
        return;
      }

      clearSensitiveFields();
      switchToMode('login');
      showSuccess('Conta criada com sucesso. Faça login.');
    } catch {
      showError('Erro ao criar conta no banco local.');
    }
  };

  const handlePasswordReset = async () => {
    if (isDatabaseUnavailable) {
      showError('Banco local indisponível no momento.');
      return;
    }

    if (!email.trim() || !recoveryCode || !newPassword) {
      showError('Informe e-mail, código de recuperação e nova senha.');
      return;
    }

    try {
      const didUpdatePassword = await resetPasswordByEmail(
        email,
        recoveryCode,
        newPassword
      );

      if (!didUpdatePassword) {
        showError('Código de recuperação inválido ou usuário não encontrado.');
        return;
      }

      clearSensitiveFields();
      switchToMode('login');
      showSuccess('Senha atualizada. Faça login com a nova senha.');
    } catch {
      showError('Erro ao atualizar senha no banco local.');
    }
  };

  const handlePrimaryAction = () => {
    if (isRegisterMode) {
      return handleRegister();
    }

    return isResetMode ? handlePasswordReset() : handleLogin();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardContainer}
      >
        <View style={[styles.card, { width: cardWidth }]}> 
          <Text style={styles.title}>Bem-vindo</Text>
          <Text style={styles.subtitle}>
            {isResetMode
              ? 'Redefinir senha'
              : isRegisterMode
                ? 'Criar nova conta'
                : 'Faça login para continuar'}
          </Text>

          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="E-mail"
            style={[styles.input, isCompactLayout && styles.compactInput]}
            value={email}
          />

          {!isResetMode && (
            <TextInput
              onChangeText={setPassword}
              placeholder="Senha"
              secureTextEntry
              style={[styles.input, isCompactLayout && styles.compactInput]}
              value={password}
            />
          )}

          {(isResetMode || isRegisterMode) && (
            <TextInput
              onChangeText={setRecoveryCode}
              placeholder="Código de recuperação"
              style={[styles.input, isCompactLayout && styles.compactInput]}
              value={recoveryCode}
            />
          )}

          {isResetMode && (
            <TextInput
              onChangeText={setNewPassword}
              placeholder="Nova senha"
              secureTextEntry
              style={[styles.input, isCompactLayout && styles.compactInput]}
              value={newPassword}
            />
          )}

          <TouchableOpacity
            disabled={isDatabaseUnavailable}
            onPress={handlePrimaryAction}
            style={[styles.primaryButton, isDatabaseUnavailable && styles.disabledButton]}
          >
            <Text style={styles.primaryButtonText}>
              {isResetMode ? 'Atualizar senha' : isRegisterMode ? 'Criar conta' : 'Entrar'}
            </Text>
          </TouchableOpacity>

          {mode === 'login' ? (
            <>
              <TouchableOpacity
                disabled={isDatabaseUnavailable}
                onPress={() => switchToMode('register')}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Criar conta</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={isDatabaseUnavailable}
                onPress={() => switchToMode('reset')}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Esqueci minha senha</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              disabled={isDatabaseUnavailable}
              onPress={() => switchToMode('login')}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>Voltar para login</Text>
            </TouchableOpacity>
          )}

          {message ? (
            <Text
              accessibilityLiveRegion="polite"
              accessibilityRole={messageType === 'error' ? 'alert' : 'text'}
              accessible
              style={[
                styles.message,
                messageType === 'error'
                  ? styles.errorMessage
                  : messageType === 'success'
                    ? styles.successMessage
                    : styles.infoMessage
              ]}
            >
              {message}
            </Text>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f3f4f6'
  },
  keyboardContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 24
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827'
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 18,
    fontSize: 15,
    color: '#4b5563'
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 12
  },
  compactInput: {
    paddingVertical: 10
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 4
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600'
  },
  disabledButton: {
    opacity: 0.6
  },
  secondaryButton: {
    marginTop: 10,
    alignItems: 'center'
  },
  secondaryButtonText: {
    color: '#1d4ed8',
    fontSize: 14,
    fontWeight: '500'
  },
  message: {
    marginTop: 14,
    textAlign: 'center',
    fontSize: 14
  },
  errorMessage: {
    color: '#b91c1c'
  },
  successMessage: {
    color: '#166534'
  },
  infoMessage: {
    color: '#1f2937'
  }
});
