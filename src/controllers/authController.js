const bcrypt = require('bcrypt');
const crypto = require('crypto');
const config = require('../config/config');
const logger = require('../utils/logger');
const database = require('../services/database');
const emailService = require('../services/emailService');
const resetTokenService = require('../services/resetTokenService');

class AuthController {
  static async loginPage(req, res) {
    if (req.session && req.session.user) {
      const next = req.query.next || '/';
      return res.redirect(next);
    }

    const loginHtml = `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.0/css/bootstrap.min.css">
    <title>Login StreamHib</title>
    <link rel="icon" type="image/x-icon" href="/static/favicon.ico">
    <style>
        body { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; }
        .card { backdrop-filter: blur(10px); background: rgba(255, 255, 255, 0.95); border: none; box-shadow: 0 15px 35px rgba(0, 0, 0, 0.1); }
        .btn-primary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border: none; }
        .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2); }
        .form-control:focus { border-color: #667eea; box-shadow: 0 0 0 0.2rem rgba(102, 126, 234, 0.25); }
        .alert { border: none; border-radius: 10px; }
    </style>
</head>
<body>
    <div class="container d-flex justify-content-center align-items-center vh-100">
        <div class="card shadow-lg" style="width:100%;max-width:400px;">
            <div class="card-body p-5">
                <div class="text-center mb-4">
                    <img src="/static/logostreamhib.png" alt="StreamHib" class="mb-3" style="height: 60px;">
                    <h3 class="card-title text-dark">Login StreamHib</h3>
                    <p class="text-muted">Masuk ke akun Anda</p>
                </div>
                
                ${req.query.error ? `<div class="alert alert-danger">${req.query.error}</div>` : ''}
                ${req.query.success ? `<div class="alert alert-success">${req.query.success}</div>` : ''}
                
                <form method="post">
                    <div class="mb-3">
                        <label for="username" class="form-label">Username atau Email</label>
                        <input type="text" id="username" name="username" class="form-control" placeholder="Masukkan username atau email" required>
                    </div>
                    <div class="mb-3">
                        <label for="password" class="form-label">Password</label>
                        <input type="password" id="password" name="password" class="form-control" placeholder="Masukkan password" required>
                    </div>
                    <div class="d-grid mb-3">
                        <button type="submit" class="btn btn-primary py-2">Login</button>
                    </div>
                </form>
                
                <div class="text-center">
                    <p class="mb-2">
                        <a href="/forgot-password" class="text-decoration-none text-primary">Lupa Password?</a>
                    </p>
                    <p class="text-muted">
                        Belum punya akun? <a href="/register" class="text-decoration-none text-primary">Daftar di sini</a>
                    </p>
                </div>
            </div>
        </div>
    </div>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.0/js/bootstrap.bundle.min.js"></script>
</body>
</html>`;

    res.send(loginHtml);
  }

  static async loginPost(req, res) {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.redirect('/login?error=' + encodeURIComponent('Username dan password wajib diisi'));
    }

    try {
      const user = await database.findUserByUsernameOrEmail(username);

      if (user && await bcrypt.compare(password, user.password)) {
        req.session.user = user.username;
        req.session.userEmail = user.email;
        req.session.userId = user.id;
        const next = req.query.next || '/';
        res.redirect(next);
      } else {
        res.redirect('/login?error=' + encodeURIComponent('Username/email atau password salah'));
      }
    } catch (error) {
      logger.error('Login error:', error);
      res.redirect('/login?error=' + encodeURIComponent('Terjadi kesalahan server'));
    }
  }

  static async registerPage(req, res) {
    try {
      const userCount = await database.getUserCount();
      
      // Check trial mode and user limit
      if (!config.trialMode.enabled && userCount >= 1) {
        const registerClosedHtml = `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.0/css/bootstrap.min.css">
    <title>Registrasi Ditutup</title>
    <link rel="icon" type="image/x-icon" href="/static/favicon.ico">
    <style>
        body { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; }
        .card { backdrop-filter: blur(10px); background: rgba(255, 255, 255, 0.95); border: none; box-shadow: 0 15px 35px rgba(0, 0, 0, 0.1); }
    </style>
</head>
<body>
    <div class="container d-flex justify-content-center align-items-center vh-100">
        <div class="card shadow-lg" style="width:100%;max-width:400px;">
            <div class="card-body p-5 text-center">
                <h3 class="card-title text-danger mb-4">Registrasi Ditutup</h3>
                <p class="text-muted mb-4">Maaf, registrasi sudah ditutup untuk mode ini. Hanya satu pengguna yang diizinkan.</p>
                <div class="d-grid">
                    <a href="/login" class="btn btn-primary">Kembali ke Login</a>
                </div>
            </div>
        </div>
    </div>
</body>
</html>`;
        return res.send(registerClosedHtml);
      }

      const registerHtml = `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.0/css/bootstrap.min.css">
    <title>Daftar StreamHib</title>
    <link rel="icon" type="image/x-icon" href="/static/favicon.ico">
    <style>
        body { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; }
        .card { backdrop-filter: blur(10px); background: rgba(255, 255, 255, 0.95); border: none; box-shadow: 0 15px 35px rgba(0, 0, 0, 0.1); }
        .btn-primary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border: none; }
        .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2); }
        .form-control:focus { border-color: #667eea; box-shadow: 0 0 0 0.2rem rgba(102, 126, 234, 0.25); }
        .alert { border: none; border-radius: 10px; }
    </style>
</head>
<body>
    <div class="container d-flex justify-content-center align-items-center vh-100">
        <div class="card shadow-lg" style="width:100%;max-width:450px;">
            <div class="card-body p-5">
                <div class="text-center mb-4">
                    <img src="/static/logostreamhib.png" alt="StreamHib" class="mb-3" style="height: 60px;">
                    <h3 class="card-title text-dark">Daftar Akun StreamHib</h3>
                    <p class="text-muted">Buat akun baru untuk mulai streaming</p>
                    ${!config.email.enabled ? '<div class="alert alert-info"><small>📧 Email service disabled - no welcome email will be sent</small></div>' : ''}
                </div>
                
                ${req.query.error ? `<div class="alert alert-danger">${req.query.error}</div>` : ''}
                
                <form method="post">
                    <div class="mb-3">
                        <label for="username" class="form-label">Username</label>
                        <input type="text" id="username" name="username" class="form-control" placeholder="Buat username unik" required>
                        <div class="form-text">Username harus unik dan akan digunakan untuk login</div>
                    </div>
                    <div class="mb-3">
                        <label for="email" class="form-label">Email</label>
                        <input type="email" id="email" name="email" class="form-control" placeholder="email@example.com" required>
                        <div class="form-text">Email akan digunakan untuk reset password</div>
                    </div>
                    <div class="mb-3">
                        <label for="password" class="form-label">Password</label>
                        <input type="password" id="password" name="password" class="form-control" placeholder="Buat password kuat" required minlength="6">
                        <div class="form-text">Minimal 6 karakter</div>
                    </div>
                    <div class="mb-3">
                        <label for="confirmPassword" class="form-label">Konfirmasi Password</label>
                        <input type="password" id="confirmPassword" name="confirmPassword" class="form-control" placeholder="Ulangi password" required>
                    </div>
                    <div class="d-grid mb-3">
                        <button type="submit" class="btn btn-primary py-2">Daftar</button>
                    </div>
                </form>
                
                <div class="text-center">
                    <p class="text-muted">
                        Sudah punya akun? <a href="/login" class="text-decoration-none text-primary">Login di sini</a>
                    </p>
                </div>
            </div>
        </div>
    </div>
    
    <script src="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.0/js/bootstrap.bundle.min.js"></script>
    <script>
        document.querySelector('form').addEventListener('submit', function(e) {
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            
            if (password !== confirmPassword) {
                e.preventDefault();
                alert('Password dan konfirmasi password tidak sama!');
                return false;
            }
        });
    </script>
</body>
</html>`;

      res.send(registerHtml);
    } catch (error) {
      logger.error('Register page error:', error);
      res.status(500).send('Terjadi kesalahan server');
    }
  }

  static async registerPost(req, res) {
    const { username, email, password, confirmPassword } = req.body;

    if (!username || !email || !password || !confirmPassword) {
      return res.redirect('/register?error=' + encodeURIComponent('Semua field wajib diisi'));
    }

    if (password !== confirmPassword) {
      return res.redirect('/register?error=' + encodeURIComponent('Password dan konfirmasi password tidak sama'));
    }

    if (password.length < 6) {
      return res.redirect('/register?error=' + encodeURIComponent('Password minimal 6 karakter'));
    }

    // Validasi email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.redirect('/register?error=' + encodeURIComponent('Format email tidak valid'));
    }

    try {
      const userCount = await database.getUserCount();

      // Check trial mode and user limit
      if (!config.trialMode.enabled && userCount >= 1) {
        return res.redirect('/register?error=' + encodeURIComponent('Registrasi ditutup (batas pengguna tercapai)'));
      }

      // Check if username already exists
      const existingUser = await database.findUserByUsername(username);
      if (existingUser) {
        return res.redirect('/register?error=' + encodeURIComponent('Username sudah ada'));
      }

      // Check if email already exists
      const existingEmail = await database.findUserByEmail(email);
      if (existingEmail) {
        return res.redirect('/register?error=' + encodeURIComponent('Email sudah terdaftar'));
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Create user
      const user = await database.createUser({
        username,
        email,
        password: hashedPassword
      });

      // Send welcome email (will be skipped if disabled)
      try {
        await emailService.sendWelcomeEmail(email, username);
        logger.info(`Welcome email processed for ${email}`);
      } catch (emailError) {
        logger.error(`Failed to send welcome email to ${email}:`, emailError);
        // Don't fail registration if email fails
      }

      req.session.user = username;
      req.session.userEmail = email;
      req.session.userId = user.id;
      res.redirect('/?welcome=1');
    } catch (error) {
      logger.error('Register error:', error);
      res.redirect('/register?error=' + encodeURIComponent('Terjadi kesalahan server'));
    }
  }

  static async forgotPasswordPage(req, res) {
    const forgotPasswordHtml = `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.0/css/bootstrap.min.css">
    <title>Lupa Password - StreamHib</title>
    <link rel="icon" type="image/x-icon" href="/static/favicon.ico">
    <style>
        body { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; }
        .card { backdrop-filter: blur(10px); background: rgba(255, 255, 255, 0.95); border: none; box-shadow: 0 15px 35px rgba(0, 0, 0, 0.1); }
        .btn-primary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border: none; }
        .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2); }
        .form-control:focus { border-color: #667eea; box-shadow: 0 0 0 0.2rem rgba(102, 126, 234, 0.25); }
        .alert { border: none; border-radius: 10px; }
    </style>
</head>
<body>
    <div class="container d-flex justify-content-center align-items-center vh-100">
        <div class="card shadow-lg" style="width:100%;max-width:450px;">
            <div class="card-body p-5">
                <div class="text-center mb-4">
                    <img src="/static/logostreamhib.png" alt="StreamHib" class="mb-3" style="height: 60px;">
                    <h3 class="card-title text-dark">Lupa Password</h3>
                    <p class="text-muted">Masukkan email Anda untuk reset password</p>
                    ${!config.email.enabled ? '<div class="alert alert-warning"><small>⚠️ Email service disabled - reset token will be shown in logs</small></div>' : ''}
                </div>
                
                ${req.query.error ? `<div class="alert alert-danger">${req.query.error}</div>` : ''}
                ${req.query.success ? `<div class="alert alert-success">${req.query.success}</div>` : ''}
                
                <form method="post">
                    <div class="mb-3">
                        <label for="email" class="form-label">Email</label>
                        <input type="email" id="email" name="email" class="form-control" placeholder="Masukkan email terdaftar" required>
                        <div class="form-text">Kami akan mengirim link reset password ke email ini</div>
                    </div>
                    <div class="d-grid mb-3">
                        <button type="submit" class="btn btn-primary py-2">Kirim Link Reset</button>
                    </div>
                </form>
                
                <div class="text-center">
                    <p class="text-muted">
                        Ingat password? <a href="/login" class="text-decoration-none text-primary">Login di sini</a>
                    </p>
                </div>
            </div>
        </div>
    </div>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.0/js/bootstrap.bundle.min.js"></script>
</body>
</html>`;

    res.send(forgotPasswordHtml);
  }

  static async forgotPasswordPost(req, res) {
    const { email } = req.body;

    if (!email) {
      return res.redirect('/forgot-password?error=' + encodeURIComponent('Email wajib diisi'));
    }

    try {
      const user = await database.findUserByEmail(email);

      if (!user) {
        // Don't reveal if email exists or not for security
        return res.redirect('/forgot-password?success=' + encodeURIComponent('Jika email terdaftar, link reset password telah dikirim'));
      }

      // Generate reset token
      const tokenData = await resetTokenService.createResetToken(email, user.username);
      const resetUrl = `${config.server.baseUrl}/reset-password?token=${tokenData.token}`;

      // Send reset email (will be skipped if disabled)
      try {
        await emailService.sendPasswordResetEmail(email, user.username, tokenData.shortToken, resetUrl);
        logger.info(`Password reset email processed for ${email}`);
      } catch (emailError) {
        logger.error(`Failed to send reset email to ${email}:`, emailError);
      }

      logger.info(`Password reset token created for ${email}: ${tokenData.shortToken}`);
      res.redirect('/forgot-password?success=' + encodeURIComponent('Link reset password telah dikirim ke email Anda. Periksa inbox dan folder spam.'));

    } catch (error) {
      logger.error('Forgot password error:', error);
      if (error.message.includes('Terlalu banyak') || error.message.includes('tunggu')) {
        res.redirect('/forgot-password?error=' + encodeURIComponent(error.message));
      } else {
        res.redirect('/forgot-password?error=' + encodeURIComponent('Terjadi kesalahan server. Coba lagi nanti.'));
      }
    }
  }

  static async resetPasswordPage(req, res) {
    const { token } = req.query;

    if (!token) {
      return res.redirect('/forgot-password?error=' + encodeURIComponent('Token reset tidak valid'));
    }

    // Validate token
    const validation = await resetTokenService.validateToken(token);
    if (!validation.valid) {
      return res.redirect('/forgot-password?error=' + encodeURIComponent(validation.error));
    }

    const resetPasswordHtml = `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.0/css/bootstrap.min.css">
    <title>Reset Password - StreamHib</title>
    <link rel="icon" type="image/x-icon" href="/static/favicon.ico">
    <style>
        body { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; }
        .card { backdrop-filter: blur(10px); background: rgba(255, 255, 255, 0.95); border: none; box-shadow: 0 15px 35px rgba(0, 0, 0, 0.1); }
        .btn-primary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border: none; }
        .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2); }
        .form-control:focus { border-color: #667eea; box-shadow: 0 0 0 0.2rem rgba(102, 126, 234, 0.25); }
        .alert { border: none; border-radius: 10px; }
    </style>
</head>
<body>
    <div class="container d-flex justify-content-center align-items-center vh-100">
        <div class="card shadow-lg" style="width:100%;max-width:450px;">
            <div class="card-body p-5">
                <div class="text-center mb-4">
                    <img src="/static/logostreamhib.png" alt="StreamHib" class="mb-3" style="height: 60px;">
                    <h3 class="card-title text-dark">Reset Password</h3>
                    <p class="text-muted">Masukkan password baru untuk akun: <strong>${validation.username}</strong></p>
                </div>
                
                ${req.query.error ? `<div class="alert alert-danger">${req.query.error}</div>` : ''}
                
                <form method="post">
                    <input type="hidden" name="token" value="${token}">
                    <div class="mb-3">
                        <label for="password" class="form-label">Password Baru</label>
                        <input type="password" id="password" name="password" class="form-control" placeholder="Masukkan password baru" required minlength="6">
                        <div class="form-text">Minimal 6 karakter</div>
                    </div>
                    <div class="mb-3">
                        <label for="confirmPassword" class="form-label">Konfirmasi Password Baru</label>
                        <input type="password" id="confirmPassword" name="confirmPassword" class="form-control" placeholder="Ulangi password baru" required>
                    </div>
                    <div class="d-grid mb-3">
                        <button type="submit" class="btn btn-primary py-2">Reset Password</button>
                    </div>
                </form>
                
                <div class="text-center">
                    <p class="text-muted">
                        <a href="/login" class="text-decoration-none text-primary">Kembali ke Login</a>
                    </p>
                </div>
            </div>
        </div>
    </div>
    
    <script src="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.0/js/bootstrap.bundle.min.js"></script>
    <script>
        document.querySelector('form').addEventListener('submit', function(e) {
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            
            if (password !== confirmPassword) {
                e.preventDefault();
                alert('Password dan konfirmasi password tidak sama!');
                return false;
            }
        });
    </script>
</body>
</html>`;

    res.send(resetPasswordHtml);
  }

  static async resetPasswordPost(req, res) {
    const { token, password, confirmPassword } = req.body;

    if (!token || !password || !confirmPassword) {
      return res.redirect(`/reset-password?token=${token}&error=` + encodeURIComponent('Semua field wajib diisi'));
    }

    if (password !== confirmPassword) {
      return res.redirect(`/reset-password?token=${token}&error=` + encodeURIComponent('Password dan konfirmasi password tidak sama'));
    }

    if (password.length < 6) {
      return res.redirect(`/reset-password?token=${token}&error=` + encodeURIComponent('Password minimal 6 karakter'));
    }

    try {
      // Validate token
      const validation = await resetTokenService.validateToken(token);
      if (!validation.valid) {
        return res.redirect('/forgot-password?error=' + encodeURIComponent(validation.error));
      }

      // Update password
      const user = await database.findUserByUsername(validation.username);
      if (!user) {
        return res.redirect('/forgot-password?error=' + encodeURIComponent('User tidak ditemukan'));
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      await database.updateUser(user.id, { 
        password: hashedPassword 
      });

      // Mark token as used
      await resetTokenService.useToken(token);

      logger.info(`Password reset successful for user: ${validation.username}`);
      res.redirect('/login?success=' + encodeURIComponent('Password berhasil direset. Silakan login dengan password baru.'));

    } catch (error) {
      logger.error('Reset password error:', error);
      res.redirect(`/reset-password?token=${token}&error=` + encodeURIComponent('Terjadi kesalahan server. Coba lagi nanti.'));
    }
  }

  static async logout(req, res) {
    req.session.destroy((err) => {
      if (err) {
        logger.error('Logout error:', err);
      }
      res.redirect('/login');
    });
  }
}

module.exports = AuthController;