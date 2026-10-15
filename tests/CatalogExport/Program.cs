using System.Data;
using System.Text.Json;
using Npgsql;

// Read-only exporter. The connection is supplied by the caller from local
// user-secrets, never stored in this project or written to the output.
var connectionString = Environment.GetEnvironmentVariable("CATALOG_SOURCE_CONNECTION")
    ?? throw new InvalidOperationException("CATALOG_SOURCE_CONNECTION is missing.");

await using var connection = new NpgsqlConnection(connectionString);
await connection.OpenAsync();
await using var transaction = await connection.BeginTransactionAsync(IsolationLevel.RepeatableRead);

await using (var readOnly = new NpgsqlCommand("set transaction read only", connection, transaction))
    await readOnly.ExecuteNonQueryAsync();

const string sql = """
    select id, title, sport_name, sport_category, division, event_category
    from public.cong_events
    order by id
    """;
await using var command = new NpgsqlCommand(sql, connection, transaction);
await using var reader = await command.ExecuteReaderAsync();
var events = new List<object>();
while (await reader.ReadAsync())
{
    events.Add(new
    {
        source_event_id = reader.GetInt32(0),
        title = reader.GetString(1),
        sport_name = reader.IsDBNull(2) ? null : reader.GetString(2),
        sport_category = reader.IsDBNull(3) ? null : reader.GetString(3),
        division = reader.GetString(4),
        event_category = reader.IsDBNull(5) ? null : reader.GetString(5)
    });
}
await reader.CloseAsync();
await transaction.CommitAsync();
Console.Write(JsonSerializer.Serialize(events));
