import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
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
import {
  createProduct,
  getProducts,
  initializeProductDatabase
} from './src/database/productRepository';

function isValidExpiryDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsedDate = new Date(`${value}T00:00:00Z`);

  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    parsedDate.getUTCFullYear() === year &&
    parsedDate.getUTCMonth() + 1 === month &&
    parsedDate.getUTCDate() === day
  );
}

function formatExpiryDate(value) {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

export default function App() {
  const { width } = useWindowDimensions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [productName, setProductName] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [products, setProducts] = useState([]);
  const [mode, setMode] = useState('login');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info');

  const isCompactLayout = width < 420;
  const isHomeMode = mode === 'home';
  const isProductMode = mode === 'products';
  const isResetMode = mode === 'reset';
  const isRegisterMode = mode === 'register';

  const cardWidth = useMemo(() => {
    if (width >= 900) return 460;
    if (width >= 600) return 420;
    return Math.max(280, width - 32);
  }, [width]);

  useEffect(() => {
    Promise.all([initializeAuthDatabase(), initializeProductDatabase()])
      .then(() => getProducts())
      .then(setProducts)
      .catch(() => {
        setMessageType('error');
        setMessage('Erro ao iniciar banco local.');
      });
  }, []);

  useEffect(() => {
    let isActive = true;

    if (!isProductMode) {
      return () => {
        isActive = false;
      };
    }

    getProducts()
      .then((registeredProducts) => {
        if (isActive) {
          setProducts(registeredProducts);
        }
      })
      .catch(() => {
        if (isActive) {
          setMessageType('error');
          setMessage('Erro ao carregar produtos cadastrados.');
        }
      });

    return () => {
      isActive = false;
    };
  }, [isProductMode]);

  const loadProducts = async () => {
    try {
      const registeredProducts = await getProducts();
      setProducts(registeredProducts);
    } catch {
      setMessageType('error');
      setMessage('Erro ao carregar produtos cadastrados.');
    }
  };

  const clearSensitiveFields = () => {
    setPassword('');
    setNewPassword('');
    setRecoveryCode('');
  };

  const clearProductFields = () => {
    setProductName('');
    setProductDescription('');
    setExpiryDate('');
  };

  const switchToMode = (nextMode) => {
    setMode(nextMode);
    clearSensitiveFields();
    if (nextMode !== 'products') {
      clearProductFields();
    }
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

      switchToMode('home');
      showSuccess('Login realizado com sucesso.');
      clearSensitiveFields();
    } catch {
      showError('Erro ao autenticar usuário no banco local.');
    }
  };

  const handleRegister = async () => {
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

  const handleCreateProduct = async () => {
    if (!productName.trim() || !expiryDate.trim()) {
      showError('Informe o nome do produto e a data de validade.');
      return;
    }

    if (!isValidExpiryDate(expiryDate.trim())) {
      showError('Informe a validade no formato AAAA-MM-DD.');
      return;
    }

    try {
      await createProduct(productName, productDescription, expiryDate.trim());
      await loadProducts();
      clearProductFields();
      showSuccess('Produto cadastrado com sucesso.');
    } catch {
      showError('Erro ao salvar produto.');
    }
  };

  const renderHomeScreen = () => (
    <>
      <Text style={styles.title}>Tela principal</Text>
      <Text style={styles.subtitle}>
        Acesse o cadastro de produtos ou encerre a sessão.
      </Text>

      <TouchableOpacity
        onPress={() => switchToMode('products')}
        style={styles.primaryButton}
      >
        <Text style={styles.primaryButtonText}>Cadastrar produto</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => switchToMode('login')}
        style={styles.secondaryButton}
      >
        <Text style={styles.secondaryButtonText}>Sair</Text>
      </TouchableOpacity>
    </>
  );

  const renderProductScreen = () => (
    <>
      <Text style={styles.title}>Cadastro de produtos</Text>
      <Text style={styles.subtitle}>
        Preencha os dados básicos e registre a validade do produto.
      </Text>

      <TextInput
        onChangeText={setProductName}
        placeholder="Nome do produto"
        style={[styles.input, isCompactLayout && styles.compactInput]}
        value={productName}
      />

      <TextInput
        onChangeText={setProductDescription}
        placeholder="Descrição do produto"
        style={[styles.input, isCompactLayout && styles.compactInput]}
        value={productDescription}
      />

      <TextInput
        onChangeText={setExpiryDate}
        keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
        placeholder="Validade (AAAA-MM-DD)"
        style={[styles.input, isCompactLayout && styles.compactInput]}
        value={expiryDate}
      />

      <TouchableOpacity
        onPress={handleCreateProduct}
        style={styles.primaryButton}
      >
        <Text style={styles.primaryButtonText}>Salvar produto</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => switchToMode('home')}
        style={styles.secondaryButton}
      >
        <Text style={styles.secondaryButtonText}>Voltar para a tela principal</Text>
      </TouchableOpacity>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Produtos cadastrados</Text>
        {products.length ? (
          products.map((product) => (
            <View key={product.id} style={styles.productItem}>
              <Text style={styles.productName}>{product.name}</Text>
              {product.description ? (
                <Text style={styles.productDescription}>{product.description}</Text>
              ) : null}
              <Text style={styles.productExpiry}>
                Validade: {formatExpiryDate(product.expiryDate)}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.emptyState}>
            Nenhum produto cadastrado até o momento.
          </Text>
        )}
      </View>
    </>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardContainer}
      >
        <ScrollView
          contentContainerStyle={[
            styles.contentContainer,
            isProductMode && styles.contentContainerTop
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.card, { width: cardWidth }]}>
            {isHomeMode ? (
              renderHomeScreen()
            ) : isProductMode ? (
              renderProductScreen()
            ) : (
              <>
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
                  onPress={handlePrimaryAction}
                  style={styles.primaryButton}
                >
                  <Text style={styles.primaryButtonText}>
                    {isResetMode ? 'Atualizar senha' : isRegisterMode ? 'Criar conta' : 'Entrar'}
                  </Text>
                </TouchableOpacity>

                {mode === 'login' ? (
                  <>
                    <TouchableOpacity
                      onPress={() => switchToMode('register')}
                      style={styles.secondaryButton}
                    >
                      <Text style={styles.secondaryButtonText}>Criar conta</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => switchToMode('reset')}
                      style={styles.secondaryButton}
                    >
                      <Text style={styles.secondaryButtonText}>Esqueci minha senha</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    onPress={() => switchToMode('login')}
                    style={styles.secondaryButton}
                  >
                    <Text style={styles.secondaryButtonText}>Voltar para login</Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            {message ? (
              <Text
                accessible
                accessibilityLiveRegion="polite"
                accessibilityRole={messageType === 'error' ? 'alert' : undefined}
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
        </ScrollView>
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
  },
  contentContainer: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 24
  },
  contentContainerTop: {
    justifyContent: 'flex-start'
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
    marginTop: 10,
    alignItems: 'center'
  },
  secondaryButtonText: {
    color: '#1d4ed8',
    fontSize: 14,
    fontWeight: '500'
  },
  section: {
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 16
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12
  },
  productItem: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#f9fafb'
  },
  productName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827'
  },
  productDescription: {
    marginTop: 4,
    fontSize: 14,
    color: '#4b5563'
  },
  productExpiry: {
    marginTop: 6,
    fontSize: 13,
    color: '#1f2937'
  },
  emptyState: {
    fontSize: 14,
    color: '#6b7280'
  },
  message: {
    marginTop: 14,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '500'
  },
  infoMessage: {
    color: '#111827'
  },
  successMessage: {
    color: '#166534'
  },
  errorMessage: {
    color: '#b91c1c'
  }
});
