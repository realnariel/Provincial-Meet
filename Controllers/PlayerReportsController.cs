using ProvMeet.Data;
using ProvMeet.Models;
using ProvMeet.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ProvMeet.Controllers;

[Authorize(Roles = "Admin,Coordinator")]
public class PlayerReportsController : Controller
{
    private readonly ApplicationDbContext _context;
    public PlayerReportsController(ApplicationDbContext context) => _context = context;

    public Task<IActionResult> Index([FromQuery] PlayerMedalReportViewModel filters) => Report(filters, false);
    public Task<IActionResult> Events([FromQuery] PlayerMedalReportViewModel filters) => Report(filters, true);

    private async Task<IActionResult> Report(PlayerMedalReportViewModel filters, bool showEvents)
    {
        var all = PlayerMedals.Build(await _context.Events.AsNoTracking().ToListAsync(),
            await _context.Teams.AsNoTracking().ToListAsync());
        static List<string> Options(IEnumerable<string> values) => values.Where(v => v.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(v => v).ToList();
        filters.Sports = Options(all.Select(x => x.Sport));
        filters.SportTypes = Options(all.Select(x => x.SportType));
        filters.Divisions = Options(all.Select(x => x.Division));
        filters.Players = Options(all.Select(x => x.Player));
        bool Matches(string value, string? filter) => string.IsNullOrWhiteSpace(filter)
            || value.Equals(filter.Trim(), StringComparison.OrdinalIgnoreCase);
        filters.Entries = all.Where(x => Matches(x.Sport, filters.Sport)
            && Matches(x.SportType, filters.SportType) && Matches(x.Category, filters.Category)
            && Matches(x.Division, filters.Division) && Matches(x.Team, filters.Team)
            && (string.IsNullOrWhiteSpace(filters.Player) || (filters.ExactPlayer
                ? Matches(x.Player, filters.Player)
                : x.Player.Contains(filters.Player.Trim(), StringComparison.OrdinalIgnoreCase))))
            .OrderBy(x => x.MedalOrder).ThenBy(x => x.Player).ThenBy(x => x.EventTitle).ToList();
        filters.ShowEvents = showEvents;
        return View("Index", filters);
    }
}
