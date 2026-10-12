using System.Text;

namespace ProvMeet.Models;

public record WinnerCandidate(PlayerMedalEntry Result)
{
    public string Key => Convert.ToBase64String(Encoding.UTF8.GetBytes($"{Result.EventId}|{Result.Medal}|{Result.Player}"));
}
