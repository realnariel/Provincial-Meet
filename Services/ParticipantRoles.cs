namespace ProvMeet.Services;

public static class ParticipantRoles
{
    public static int Order(string? role)
    {
        var value = (role ?? "").Trim().ToLowerInvariant();
        if (value == "" || value.Contains("athlete")) return 0;
        if (value.Contains("assistant") && value.Contains("coach")) return 2;
        if (value.Contains("coach")) return 1;
        if (value.Contains("chaperon")) return 3;
        return 4;
    }
}
