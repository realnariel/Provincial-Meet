using ProvMeet.Models;
using System.Text.RegularExpressions;

namespace ProvMeet.Services;

public static class PlayerMedals
{
    public static string Normalize(string? value) => Regex.Replace(value?.Trim() ?? "", @"\s+", " ");

    public static IEnumerable<string> Names(string? value) => (value ?? "")
        .Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)
        .Select(Normalize).Where(name => name.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase);

    public static string Category(Event ev)
    {
        var category = Normalize(ev.EventCategory);
        return new[] { "Boys", "Girls", "Mixed" }
            .FirstOrDefault(value => value.Equals(category, StringComparison.OrdinalIgnoreCase)) ?? "Unspecified";
    }

    public static List<PlayerMedalEntry> Build(IEnumerable<Event> events, IEnumerable<Team> teams)
    {
        var teamNames = teams.ToDictionary(team => team.Id, team => Normalize(team.Name));
        var entries = new List<PlayerMedalEntry>();
        foreach (var ev in events)
        {
            void Add(string? rawNames, int? teamId, string medal)
            {
                // A name alone is not an awarded medal: the matching winning team must be recorded.
                if (!teamId.HasValue) return;
                var team = teamNames.GetValueOrDefault(teamId.Value, $"Team #{teamId.Value}");
                foreach (var name in Names(rawNames))
                    entries.Add(new(ev.Id, ev.Title, Normalize(ev.SportName), Normalize(ev.SportCategory),
                        Category(ev), Normalize(ev.Division), name, team, string.Empty, medal));
            }
            Add(ev.GoldWinnerName, ev.GoldTeamId, "Gold");
            Add(ev.SilverWinnerName, ev.SilverTeamId, "Silver");
            Add(ev.BronzeWinnerName, ev.BronzeTeamId, "Bronze");
        }
        return entries;
    }
}
