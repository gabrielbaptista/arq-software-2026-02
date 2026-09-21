import { useEffect, useMemo, useState } from 'react';
import {
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
  getDevelopmentCredentialsHint,
  initializeAuthDatabase,
  updatePasswordByEmail
} from './src/database/authRepository';

export default function App() {
  const { width } = useWindowDimensions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [isResetMode, setIsResetMode] = useState(false);
  const [message, setMessage] = useState('');

  const isCompactLayout = width < 420;

  const cardWidth = useMemo(() => {
    if (width >= 900) return 460;
    if (width >= 600) return 420;
    return Math.max(280, width - 32);
  }, [width]);

  useEffect(() => {
    initializeAuthDatabase().catch(() => {
      setMessage('Erro ao iniciar banco local.');
    });
  }, []);

  const clearSensitiveFields = () => {
    setPassword('');
    setNewPassword('');
    setRecoveryCode('');
  };

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setMessage('Informe e-mail e senha.');
      return;
    }

    try {
      const isValidUser = await authenticateUser(email, password);
      setMessage(isValidUser ? 'Login realizado com sucesso.' : 'Credenciais inválidas.');

      if (isValidUser) {
        clearSensitiveFields();
      }
    } catch {
      setMessage('Erro ao autenticar usuário no banco local.');
    }
  };

  const handlePasswordReset = async () => {
    if (!email.trim() || !recoveryCode || !newPassword) {
      setMessage('Informe e-mail, código de recuperação e nova senha.');
      return;
    }

    try {
      const didUpdatePassword = await updatePasswordByEmail(
        email,
        recoveryCode,
        newPassword
      );

      if (!didUpdatePassword) {
        setMessage('Dados inválidos para redefinição de senha.');
        return;
      }

      clearSensitiveFields();
      setIsResetMode(false);
      setMessage('Senha atualizada. Faça login com a nova senha.');
    } catch {
      setMessage('Erro ao atualizar senha no banco local.');
    }
  };

  const developmentCredentialsHint = getDevelopmentCredentialsHint();

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardContainer}
      >
        <View style={[styles.card, { width: cardWidth }]}> 
          <Text style={styles.title}>Bem-vindo</Text>
          <Text style={styles.subtitle}>
            {isResetMode ? 'Redefinir senha' : 'Faça login para continuar'}
          </Text>

          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="E-mail"
            style={[styles.input, isCompactLayout && styles.compactInput]}
            value={email}
          />

          {!isResetMode ? (
            <TextInput
              onChangeText={setPassword}
              placeholder="Senha"
              secureTextEntry
              style={[styles.input, isCompactLayout && styles.compactInput]}
              value={password}
            />
          ) : (
            <>
              <TextInput
                autoCapitalize="characters"
                onChangeText={setRecoveryCode}
                placeholder="Código de recuperação"
                style={[styles.input, isCompactLayout && styles.compactInput]}
                value={recoveryCode}
              />
              <TextInput
                onChangeText={setNewPassword}
                placeholder="Nova senha"
                secureTextEntry
                style={[styles.input, isCompactLayout && styles.compactInput]}
                value={newPassword}
              />
            </>
          )}

          <TouchableOpacity
            onPress={isResetMode ? handlePasswordReset : handleLogin}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>
              {isResetMode ? 'Atualizar senha' : 'Entrar'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              setIsResetMode((currentValue) => !currentValue);
              clearSensitiveFields();
              setMessage('');
            }}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>
              {isResetMode ? 'Voltar para login' : 'Esqueci minha senha'}
            </Text>
          </TouchableOpacity>

          {message ? <Text style={styles.message}>{message}</Text> : null}
          {developmentCredentialsHint ? (
            <Text style={styles.hint}>{developmentCredentialsHint}</Text>
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
  secondaryButton: {
    marginTop: 14,
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
    color: '#111827',
    fontSize: 14
  },
  hint: {
    marginTop: 12,
    textAlign: 'center',
    color: '#6b7280',
    fontSize: 12
  }
});
