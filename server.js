const express = require("express")

const server = express()

server.all("/", (req, res) => {
    res.send('Reminder bot 2 test build is working.')
})

function keepAlive(){
    server.listen(3000, () => {
      console.log("Ready.")
    })
}

module.exports = keepAlive

