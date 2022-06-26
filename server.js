const express = require("express")

const server = express()

server.all("/", (req, res) => {
    res.send('Reminder bot 2 is on the clock.')
})

function keepAlive(){
    server.listen(3000, () => {
      console.log("Ready.")
    })
}

module.exports = keepAlive

