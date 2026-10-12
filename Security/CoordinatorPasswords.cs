using System.Security.Cryptography;
using System.Text;

namespace ProvMeet.Security;

public static class CoordinatorPasswords
{
    // Fits the existing 100-character passwordhash column; no database migration required.
    private const string Prefix = "$pbkdf2-sha256$";
    private const int Iterations = 600_000;

    public static string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(16);
        var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA256, 32);
        return $"{Prefix}{Iterations}${Convert.ToBase64String(salt)}${Convert.ToBase64String(hash)}";
    }

    public static bool Verify(string stored, string password, out bool legacy)
    {
        legacy = !stored.StartsWith(Prefix, StringComparison.Ordinal);
        if (legacy)
            return CryptographicOperations.FixedTimeEquals(
                SHA256.HashData(Encoding.UTF8.GetBytes(stored)),
                SHA256.HashData(Encoding.UTF8.GetBytes(password)));

        var parts = stored.Split('$');
        if (parts.Length != 5 || parts[2] != Iterations.ToString()) return false;
        try
        {
            var salt = Convert.FromBase64String(parts[3]);
            var expected = Convert.FromBase64String(parts[4]);
            if (salt.Length != 16 || expected.Length != 32) return false;
            var actual = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA256, 32);
            return CryptographicOperations.FixedTimeEquals(expected, actual);
        }
        catch (FormatException) { return false; }
    }
}
